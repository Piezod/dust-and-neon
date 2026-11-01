import {
  MAX_ROOM_PLAYERS,
  NETWORK_PROTOCOL_VERSION,
  generateSessionToken,
  isValidRoomCode,
  parseClientMessage,
  sanitizeDisplayName,
  serializeMessage,
  type NetworkRole,
  type NetworkRoomPhase,
  type NetworkRoomPlayer,
  type NetworkServerMessage,
} from '../../src/multiplayer/protocol'

interface RoomMember {
  readonly id: string
  readonly role: NetworkRole
  readonly displayName: string
  readonly tokenHash: string
  connected: boolean
}

interface StoredRoom {
  readonly code: string
  phase: NetworkRoomPhase
  readonly players: RoomMember[]
  lastActivity: number
}

interface SocketAttachment {
  readonly authenticated: boolean
  readonly playerId?: string
  readonly role?: NetworkRole
  lastSeen?: number
  lastInputSeq?: number
}

const MAX_UNAUTHENTICATED_SOCKETS = 4
const HEARTBEAT_INTERVAL_MS = 15_000
const HEARTBEAT_TIMEOUT_MS = 40_000
const EMPTY_ROOM_TTL_MS = 120_000
const MAX_SNAPSHOT_SEQUENCE = Number.MAX_SAFE_INTEGER

export class MultiplayerRoom {
  private readonly state: DurableObjectState
  private room: StoredRoom | null = null
  private readonly ready: Promise<void>
  private lastSnapshotSeq = -1

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state
    this.ready = state.blockConcurrencyWhile(async () => {
      this.room = await state.storage.get<StoredRoom>('room') ?? null
    })
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready
    const url = new URL(request.url)
    if (url.pathname === '/internal/create' && request.method === 'POST') return this.createRoom(request)
    if (url.pathname === '/internal/join' && request.method === 'POST') return this.joinRoom(request)
    if (url.pathname === '/socket' && request.method === 'GET') return this.openSocket(request)
    return jsonResponse({ code: 'NOT_FOUND', message: 'No existe este endpoint de sala.' }, 404)
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    await this.ready
    const attachment = readAttachment(socket)
    const message = parseClientMessage(data)
    if (!message) {
      this.sendError(socket, 'INVALID_MESSAGE', 'El mensaje no tiene un formato valido.', false)
      return
    }
    if (!attachment.authenticated) {
      if (message.type !== 'auth') {
        this.sendError(socket, 'AUTH_REQUIRED', 'La sala requiere una credencial valida.', false)
        socket.close(4001, 'Authentication required')
        return
      }
      await this.authenticate(socket, message.token)
      return
    }
    if (!this.room || !attachment.playerId || !attachment.role) {
      this.sendError(socket, 'ROOM_CLOSED', 'La sala ya no esta disponible.', false)
      socket.close(4002, 'Room closed')
      return
    }
    const member = this.room.players.find((player) => player.id === attachment.playerId)
    if (!member || member.role !== attachment.role || !member.connected) {
      this.sendError(socket, 'SESSION_INVALID', 'La sesion ya no esta activa.', false)
      socket.close(4003, 'Session invalid')
      return
    }
    attachment.lastSeen = Date.now()
    if (message.type === 'heartbeat') {
      socket.serializeAttachment(attachment)
      this.send(socket, { version: NETWORK_PROTOCOL_VERSION, type: 'heartbeat.ack', clientTime: message.clientTime, serverTime: Date.now() })
      return
    }
    if (message.type === 'lobby.leave') {
      await this.leave(socket, member)
      return
    }
    if (message.type === 'lobby.start') {
      if (member.role !== 'host' || this.room.phase !== 'lobby') {
        this.sendError(socket, 'START_NOT_ALLOWED', 'Solo el anfitrion puede iniciar desde la sala de espera.', false)
        return
      }
      this.room.phase = 'playing'
      this.room.lastActivity = Date.now()
      await this.persistRoom()
      this.broadcast({ version: NETWORK_PROTOCOL_VERSION, type: 'session.started' })
      this.broadcastRoomState()
      return
    }
    if (message.type === 'lobby.reset') {
      if (member.role !== 'host' || this.room.phase !== 'ended') {
        this.sendError(socket, 'RESET_NOT_ALLOWED', 'El anfitrion puede reiniciar desde la pantalla final.', false)
        return
      }
      this.room.phase = 'lobby'
      this.lastSnapshotSeq = -1
      this.room.lastActivity = Date.now()
      await this.persistRoom()
      this.broadcastRoomState()
      return
    }
    if (message.type === 'input') {
      if (member.role !== 'guest' || this.room.phase !== 'playing') {
        this.sendError(socket, 'INPUT_NOT_ALLOWED', 'Solo el invitado puede enviar acciones durante la partida.', false)
        return
      }
      const previous = attachment.lastInputSeq ?? -1
      if (message.seq <= previous) return
      attachment.lastInputSeq = message.seq
      socket.serializeAttachment(attachment)
      const host = this.findSocket('host')
      if (host) this.send(host, { version: NETWORK_PROTOCOL_VERSION, type: 'input.forward', playerId: member.id, input: message })
      return
    }
    if (message.type === 'snapshot') {
      if (member.role !== 'host' || this.room.phase !== 'playing') {
        this.sendError(socket, 'AUTHORITY_REQUIRED', 'Solo el anfitrion puede publicar el estado de la partida.', false)
        return
      }
      if (message.seq <= this.lastSnapshotSeq || message.seq > MAX_SNAPSHOT_SEQUENCE) return
      this.lastSnapshotSeq = message.seq
      this.room.lastActivity = Date.now()
      this.broadcast({ version: NETWORK_PROTOCOL_VERSION, type: 'snapshot', seq: message.seq, hostTime: message.hostTime, snapshot: message.snapshot }, socket)
      if (message.snapshot.phase === 'game-over' && this.room.phase === 'playing') {
        this.room.phase = 'ended'
        await this.persistRoom()
        this.broadcastRoomState()
      }
      return
    }
    if (message.type === 'auth') this.sendError(socket, 'ALREADY_AUTHENTICATED', 'La sesion ya esta autenticada.', false)
  }

  async webSocketClose(socket: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    await this.ready
    const attachment = readAttachment(socket)
    if (!attachment.authenticated || !attachment.playerId || !this.room) return
    const member = this.room.players.find((player) => player.id === attachment.playerId)
    if (!member || !member.connected) return
    member.connected = false
    this.room.lastActivity = Date.now()
    if (member.role === 'host') {
      this.room.phase = 'ended'
      await this.persistRoom()
      this.broadcast({ version: NETWORK_PROTOCOL_VERSION, type: 'session.ended', reason: 'host-left', message: 'El anfitrion abandono la sala. La sesion ha terminado.' })
      this.closeSockets(socket, 4004, 'Host left the room')
      this.scheduleCleanup()
      return
    }
    if (this.room.phase === 'lobby') this.room.players.splice(this.room.players.indexOf(member), 1)
    await this.persistRoom()
    this.broadcastRoomState()
    if (this.connectedSockets().length === 0) this.scheduleCleanup()
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket, 1011, 'WebSocket error', false)
  }

  async alarm(): Promise<void> {
    await this.ready
    if (!this.room) return
    const now = Date.now()
    for (const socket of this.connectedSockets()) {
      const attachment = readAttachment(socket)
      if (attachment.authenticated && now - (attachment.lastSeen ?? 0) > HEARTBEAT_TIMEOUT_MS) {
        socket.close(4005, 'Heartbeat timeout')
      }
    }
    if (this.connectedSockets().length === 0 && now - this.room.lastActivity >= EMPTY_ROOM_TTL_MS) {
      await this.state.storage.deleteAll()
      this.room = null
      this.lastSnapshotSeq = -1
      return
    }
    this.scheduleNextAlarm()
  }

  private async createRoom(request: Request): Promise<Response> {
    const body = await readSmallJson(request)
    if (!body || !isValidRoomCode(body.code)) return jsonResponse({ code: 'INVALID_ROOM', message: 'No se pudo crear el codigo de sala.' }, 400)
    const displayName = sanitizeDisplayName(body.displayName)
    if (!displayName) return jsonResponse({ code: 'INVALID_NAME', message: 'El nombre debe tener entre 2 y 20 caracteres.' }, 400)
    if (this.room) return jsonResponse({ code: 'ROOM_EXISTS', message: 'El codigo de sala ya esta ocupado.' }, 409)
    const token = generateSessionToken()
    const host: RoomMember = {
      id: crypto.randomUUID(), role: 'host', displayName, tokenHash: await hashToken(token), connected: false,
    }
    this.room = { code: body.code, phase: 'lobby', players: [host], lastActivity: Date.now() }
    await this.persistRoom()
    this.scheduleCleanup()
    return jsonResponse({ roomCode: body.code, token, playerId: host.id, role: host.role, displayName })
  }

  private async joinRoom(request: Request): Promise<Response> {
    const body = await readSmallJson(request)
    const displayName = sanitizeDisplayName(body?.displayName)
    if (!displayName) return jsonResponse({ code: 'INVALID_NAME', message: 'El nombre debe tener entre 2 y 20 caracteres.' }, 400)
    if (!this.room) return jsonResponse({ code: 'ROOM_NOT_FOUND', message: 'No existe una sala con ese codigo.' }, 404)
    if (this.room.phase !== 'lobby') return jsonResponse({ code: 'ROOM_STARTED', message: 'La partida ya empezo; no se aceptan nuevas incorporaciones.' }, 409)
    if (this.room.players.some((player) => player.role === 'guest')) return jsonResponse({ code: 'ROOM_FULL', message: 'La sala ya tiene dos jugadores.' }, 409)
    if (this.room.players.length >= MAX_ROOM_PLAYERS) return jsonResponse({ code: 'ROOM_FULL', message: 'La sala ya tiene dos jugadores.' }, 409)
    const token = generateSessionToken()
    const guest: RoomMember = {
      id: crypto.randomUUID(), role: 'guest', displayName, tokenHash: await hashToken(token), connected: false,
    }
    this.room.players.push(guest)
    this.room.lastActivity = Date.now()
    await this.persistRoom()
    return jsonResponse({ roomCode: this.room.code, token, playerId: guest.id, role: guest.role, displayName })
  }

  private async openSocket(request: Request): Promise<Response> {
    if (!this.room || this.room.phase === 'ended') return jsonResponse({ code: 'ROOM_CLOSED', message: 'La sala ya no esta disponible.' }, 410)
    const upgrade = request.headers.get('Upgrade')
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') return jsonResponse({ code: 'UPGRADE_REQUIRED', message: 'Este endpoint requiere WebSocket.' }, 426)
    const sockets = this.connectedSockets()
    if (sockets.length >= MAX_ROOM_PLAYERS + MAX_UNAUTHENTICATED_SOCKETS) return jsonResponse({ code: 'ROOM_BUSY', message: 'La sala esta temporalmente ocupada.' }, 429)
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.state.acceptWebSocket(server)
    server.serializeAttachment({ authenticated: false } satisfies SocketAttachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  private async authenticate(socket: WebSocket, token: string): Promise<void> {
    if (!this.room || this.room.phase === 'ended') {
      this.sendError(socket, 'ROOM_CLOSED', 'La sala ya no esta disponible.', false)
      socket.close(4002, 'Room closed')
      return
    }
    const tokenHash = await hashToken(token)
    const member = this.room.players.find((player) => constantTimeEqual(player.tokenHash, tokenHash))
    if (!member) {
      this.sendError(socket, 'INVALID_CREDENTIAL', 'La credencial de sesion no es valida.', false)
      socket.close(4001, 'Invalid session credential')
      return
    }
    if (this.room.phase === 'playing' && !member.connected) {
      this.sendError(socket, 'REJOIN_UNAVAILABLE', 'No se puede reconectar a una partida empezada en esta version.', false)
      socket.close(4006, 'Rejoin unavailable')
      return
    }
    if (this.findSocket(member.role)) {
      this.sendError(socket, 'SESSION_IN_USE', 'Esta sesion ya esta conectada en otro cliente.', false)
      socket.close(4007, 'Session already connected')
      return
    }
    member.connected = true
    this.room.lastActivity = Date.now()
    const attachment: SocketAttachment = { authenticated: true, playerId: member.id, role: member.role, lastSeen: Date.now(), lastInputSeq: -1 }
    socket.serializeAttachment(attachment)
    await this.persistRoom()
    await this.state.storage.deleteAlarm()
    this.send(socket, {
      version: NETWORK_PROTOCOL_VERSION,
      type: 'session.ready',
      roomCode: this.room.code,
      role: member.role,
      playerId: member.id,
      phase: this.room.phase,
      players: this.publicPlayers(),
    })
    this.broadcastRoomState()
    this.scheduleNextAlarm()
  }

  private async leave(socket: WebSocket, member: RoomMember): Promise<void> {
    if (!this.room) return
    member.connected = false
    this.room.lastActivity = Date.now()
    if (member.role === 'host') {
      this.room.phase = 'ended'
      await this.persistRoom()
      this.broadcast({ version: NETWORK_PROTOCOL_VERSION, type: 'session.ended', reason: 'host-left', message: 'El anfitrion abandono la sala. La sesion ha terminado.' })
      this.closeSockets(socket, 4004, 'Host left the room')
      this.scheduleCleanup()
      return
    }
    if (this.room.phase === 'lobby') this.room.players.splice(this.room.players.indexOf(member), 1)
    await this.persistRoom()
    this.broadcastRoomState()
    socket.close(1000, 'Left room')
    if (this.connectedSockets().length <= 1) this.scheduleNextAlarm()
  }

  private publicPlayers(): NetworkRoomPlayer[] {
    return this.room?.players.map(({ id, displayName, role, connected }) => ({ id, displayName, role, connected })) ?? []
  }

  private broadcastRoomState(): void {
    if (!this.room) return
    this.broadcast({ version: NETWORK_PROTOCOL_VERSION, type: 'room.state', phase: this.room.phase, players: this.publicPlayers() })
  }

  private broadcast(message: NetworkServerMessage, exclude?: WebSocket): void {
    const payload = serializeMessage(message)
    for (const socket of this.connectedSockets()) {
      if (socket === exclude || !readAttachment(socket).authenticated) continue
      try { socket.send(payload) } catch { socket.close(1011, 'Send failed') }
    }
  }

  private send(socket: WebSocket, message: NetworkServerMessage): void {
    try { socket.send(serializeMessage(message)) } catch { socket.close(1011, 'Send failed') }
  }

  private sendError(socket: WebSocket, code: string, message: string, retryable: boolean): void {
    this.send(socket, { version: NETWORK_PROTOCOL_VERSION, type: 'server.error', code, message, retryable })
  }

  private findSocket(role: NetworkRole): WebSocket | null {
    return this.connectedSockets().find((socket) => {
      const attachment = readAttachment(socket)
      return attachment.authenticated && attachment.role === role
    }) ?? null
  }

  private connectedSockets(): WebSocket[] {
    return this.state.getWebSockets()
  }

  private closeSockets(exclude: WebSocket | undefined, code: number, reason: string): void {
    for (const socket of this.connectedSockets()) if (socket !== exclude) socket.close(code, reason)
  }

  private async persistRoom(): Promise<void> {
    if (this.room) await this.state.storage.put('room', this.room)
  }

  private scheduleCleanup(): void {
    void this.state.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL_MS)
  }

  private scheduleNextAlarm(): void {
    void this.state.storage.setAlarm(Date.now() + HEARTBEAT_INTERVAL_MS)
  }
}

function readAttachment(socket: WebSocket): SocketAttachment {
  const value: unknown = socket.deserializeAttachment()
  if (typeof value !== 'object' || value === null || !('authenticated' in value)) return { authenticated: false }
  return value as SocketAttachment
}

async function readSmallJson(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get('Content-Length') ?? 0)
  if (length > 2_048) return null
  try {
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > 2_048) return null
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(first: string, second: string): boolean {
  if (first.length !== second.length) return false
  let difference = 0
  for (let index = 0; index < first.length; index++) difference |= first.charCodeAt(index) ^ second.charCodeAt(index)
  return difference === 0
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}
