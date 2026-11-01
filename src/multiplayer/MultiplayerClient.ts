import {
  NETWORK_PROTOCOL_VERSION,
  parseServerMessage,
  sanitizeDisplayName,
  serializeMessage,
  type NetworkClientMessage,
  type NetworkInput,
  type NetworkRole,
  type NetworkRoomPhase,
  type NetworkRoomPlayer,
  type NetworkServerMessage,
  type NetworkSnapshot,
} from './protocol'
import type { MultiplayerGameBridge } from './MultiplayerGameBridge'

export type MultiplayerConnectionState = 'idle' | 'connecting' | 'authenticating' | 'lobby' | 'playing' | 'ended' | 'closed'

export interface MultiplayerCredentials {
  readonly roomCode: string
  readonly token: string
  readonly playerId: string
  readonly role: NetworkRole
  readonly displayName: string
}

export interface MultiplayerClientUpdate {
  readonly state: MultiplayerConnectionState
  readonly roomPhase: NetworkRoomPhase | null
  readonly players: readonly NetworkRoomPlayer[]
  readonly message: string
  readonly lastServerMessage: NetworkServerMessage | null
}

export interface MultiplayerDiagnostics {
  readonly role: NetworkRole | null
  readonly connectionState: MultiplayerConnectionState
  readonly rttToRoomServerMs: number | null
  readonly snapshotsPerSecond: number
  readonly messagesSentPerSecond: number
  readonly messagesReceivedPerSecond: number
  readonly bytesSentPerSecond: number
  readonly bytesReceivedPerSecond: number
}

const HEARTBEAT_INTERVAL_MS = 5_000
const HEARTBEAT_TIMEOUT_MS = 35_000
const METRICS_INTERVAL_MS = 1_000

export class MultiplayerClient implements MultiplayerGameBridge {
  private readonly httpBase: string
  private readonly wsBase: string
  private socket: WebSocket | null = null
  private credentials: MultiplayerCredentials | null = null
  private stateValue: MultiplayerConnectionState = 'idle'
  private roomPhase: NetworkRoomPhase | null = null
  private players: readonly NetworkRoomPlayer[] = []
  private message = ''
  private latestSnapshot: { readonly seq: number; readonly hostTime: number; readonly snapshot: NetworkSnapshot } | null = null
  private latestInput: Extract<NetworkServerMessage, { type: 'input.forward' }> | null = null
  private lastSnapshotSeq = -1
  private lastSentInputSeq = -1
  private lastClientCommandSeq = 0
  private lastHeartbeatAckAt = 0
  private heartbeatTimer: number | null = null
  private metricsTimer: number | null = null
  private updateListeners = new Set<(update: MultiplayerClientUpdate) => void>()
  private messageListeners = new Set<(message: NetworkServerMessage) => void>()
  private messagesSent = 0
  private messagesReceived = 0
  private bytesSent = 0
  private bytesReceived = 0
  private snapshotCount = 0
  private messagesSentPerSecond = 0
  private messagesReceivedPerSecond = 0
  private bytesSentPerSecond = 0
  private bytesReceivedPerSecond = 0
  private snapshotsPerSecond = 0
  private rttToRoomServerMs: number | null = null
  private metricsStartedAt = 0
  private lastSnapshotWindowAt = 0
  private lastHeartbeatClientTime: number | null = null
  private intentionalClose = false
  private disposed = false

  constructor(httpBase = getHttpBase(), wsBase = getWebSocketBase(httpBase)) {
    this.httpBase = httpBase.replace(/\/$/, '')
    this.wsBase = wsBase.replace(/\/$/, '')
  }

  get update(): MultiplayerClientUpdate {
    return { state: this.stateValue, roomPhase: this.roomPhase, players: this.players, message: this.message, lastServerMessage: null }
  }

  get role(): NetworkRole | null {
    return this.credentials?.role ?? null
  }

  get localPlayerId(): string | null {
    return this.credentials?.playerId ?? null
  }

  get playerId(): string | null {
    return this.localPlayerId
  }

  get connectionState(): MultiplayerConnectionState {
    return this.stateValue
  }

  get roomPhaseStatus(): NetworkRoomPhase | null {
    return this.roomPhase
  }

  get connectedPlayers(): readonly NetworkRoomPlayer[] {
    return this.players
  }

  get roomCode(): string | null {
    return this.credentials?.roomCode ?? null
  }

  get displayName(): string | null {
    return this.credentials?.displayName ?? null
  }

  get currentSnapshot(): NetworkSnapshot | null {
    return this.latestSnapshot?.snapshot ?? null
  }

  get currentSnapshotSequence(): number {
    return this.latestSnapshot?.seq ?? -1
  }

  get diagnostics(): MultiplayerDiagnostics {
    return {
      role: this.role,
      connectionState: this.stateValue,
      rttToRoomServerMs: this.rttToRoomServerMs,
      snapshotsPerSecond: this.snapshotsPerSecond,
      messagesSentPerSecond: this.messagesSentPerSecond,
      messagesReceivedPerSecond: this.messagesReceivedPerSecond,
      bytesSentPerSecond: this.bytesSentPerSecond,
      bytesReceivedPerSecond: this.bytesReceivedPerSecond,
    }
  }

  subscribe(listener: (update: MultiplayerClientUpdate) => void): () => void {
    this.updateListeners.add(listener)
    listener(this.update)
    return () => this.updateListeners.delete(listener)
  }

  onMessage(listener: (message: NetworkServerMessage) => void): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  async createRoom(name: string): Promise<void> {
    const displayName = this.validateName(name)
    const response = await this.request('/api/rooms', { displayName })
    await this.connect(response)
  }

  async joinRoom(code: string, name: string): Promise<void> {
    const roomCode = code.trim().toUpperCase()
    const displayName = this.validateName(name)
    if (!/^[A-HJ-NP-Z2-9]{12}$/.test(roomCode)) throw new Error('El codigo debe tener 12 caracteres validos.')
    const response = await this.request(`/api/rooms/${roomCode}/join`, { displayName })
    await this.connect(response)
  }

  startGame(): void {
    if (this.role !== 'host' || this.stateValue !== 'lobby') throw new Error('Solo el anfitrion puede iniciar desde la sala de espera.')
    this.send({ version: NETWORK_PROTOCOL_VERSION, type: 'lobby.start', seq: ++this.lastClientCommandSeq })
  }

  resetToLobby(): void {
    if (this.role !== 'host' || this.stateValue !== 'ended') return
    this.latestSnapshot = null
    this.lastSnapshotSeq = -1
    this.lastSentInputSeq = -1
    this.send({ version: NETWORK_PROTOCOL_VERSION, type: 'lobby.reset', seq: ++this.lastClientCommandSeq })
  }

  leaveRoom(): void {
    this.intentionalClose = true
    if (this.socket?.readyState === WebSocket.OPEN) {
      try { this.send({ version: NETWORK_PROTOCOL_VERSION, type: 'lobby.leave', seq: ++this.lastClientCommandSeq }) } catch { /* Socket is already closing. */ }
      this.socket.close(1000, 'Left room')
    }
    this.stopTimers()
    this.stateValue = 'closed'
    this.roomPhase = null
    this.emitUpdate('Has salido de la sala.')
  }

  sendInput(input: Omit<NetworkInput, 'version' | 'type' | 'seq' | 'clientTime'>): void {
    if (this.role !== 'guest' || this.stateValue !== 'playing') return
    const message: NetworkInput = {
      version: NETWORK_PROTOCOL_VERSION,
      type: 'input',
      seq: ++this.lastSentInputSeq,
      clientTime: Date.now(),
      ...input,
    }
    this.send(message)
  }

  getLatestInput(): Extract<NetworkServerMessage, { type: 'input.forward' }> | null {
    return this.latestInput
  }

  sendSnapshot(snapshot: NetworkSnapshot, hostTime = Date.now()): void {
    if (this.role !== 'host' || this.stateValue !== 'playing') return
    const seq = ++this.lastSnapshotSeq
    this.send({ version: NETWORK_PROTOCOL_VERSION, type: 'snapshot', seq, hostTime, snapshot })
  }

  getDiagnostics(): MultiplayerDiagnostics {
    return this.diagnostics
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.intentionalClose = true
    this.stopTimers()
    this.socket?.close(1000, 'Client disposed')
    this.socket = null
    this.updateListeners.clear()
    this.messageListeners.clear()
    this.credentials = null
    this.latestInput = null
    this.latestSnapshot = null
  }

  private async request(path: string, body: unknown): Promise<MultiplayerCredentials> {
    if (this.disposed) throw new Error('La conexion ya fue cerrada.')
    let response: Response
    try {
      response = await fetch(`${this.httpBase}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
    } catch {
      throw new Error('No se pudo contactar al servidor de salas. Revisa la URL y que Wrangler este activo.')
    }
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const error = typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string'
        ? payload.message : `El servidor rechazo la solicitud (${response.status}).`
      throw new Error(error)
    }
    if (!isCredentials(payload)) throw new Error('El servidor devolvio una respuesta de sala invalida.')
    return payload
  }

  private async connect(credentials: MultiplayerCredentials): Promise<void> {
    if (this.disposed) throw new Error('La conexion ya fue cerrada.')
    this.credentials = credentials
    this.stateValue = 'connecting'
    this.roomPhase = 'lobby'
    this.metricsStartedAt = performance.now()
    this.emitUpdate('Conectando al servidor de salas...')
    const socket = new WebSocket(`${this.wsBase}/api/rooms/${credentials.roomCode}/socket`)
    this.socket = socket
    socket.addEventListener('message', this.onSocketMessage)
    socket.addEventListener('close', this.onSocketClose)
    socket.addEventListener('error', this.onSocketError)
    await new Promise<void>((resolve, reject) => {
      let settled = false
      socket.addEventListener('open', () => {
        this.stateValue = 'authenticating'
        this.emitUpdate('Autenticando la sesion...')
        try {
          this.send({ version: NETWORK_PROTOCOL_VERSION, type: 'auth', token: credentials.token })
          this.startTimers()
          settled = true
          resolve()
        } catch (error) {
          settled = true
          reject(error)
        }
      }, { once: true })
      socket.addEventListener('error', () => {
        if (!settled) {
          settled = true
          reject(new Error('No se pudo abrir el WebSocket de la sala.'))
        }
      }, { once: true })
      socket.addEventListener('close', (event) => {
        if (!settled) {
          settled = true
          reject(new Error(this.closeMessage(event.code)))
        }
      }, { once: true })
    }).catch((error: unknown) => {
      this.stopTimers()
      this.stateValue = 'closed'
      this.emitUpdate(error instanceof Error ? error.message : 'La conexion fallo.')
      throw error
    })
  }

  private readonly onSocketMessage = (event: MessageEvent): void => {
    const message = parseServerMessage(typeof event.data === 'string' ? event.data : event.data as ArrayBuffer)
    this.countReceived(typeof event.data === 'string' ? new TextEncoder().encode(event.data).byteLength : 0)
    if (!message) {
      this.message = 'El servidor envio un mensaje que no cumple el protocolo v1.'
      this.emitUpdate()
      return
    }
    this.messageListeners.forEach((listener) => listener(message))
    if (message.type === 'session.ready') {
      if (message.playerId !== this.localPlayerId || message.role !== this.role || message.roomCode !== this.roomCode) {
        this.socket?.close(4003, 'Session mismatch')
        return
      }
      this.roomPhase = message.phase
      this.players = message.players
      this.stateValue = message.phase === 'playing' ? 'playing' : message.phase === 'ended' ? 'ended' : 'lobby'
      this.lastHeartbeatAckAt = Date.now()
      this.emitUpdate(message.phase === 'lobby' ? 'Sala conectada.' : 'La sala ya esta en marcha.')
    } else if (message.type === 'room.state') {
      this.roomPhase = message.phase
      this.players = message.players
      if (message.phase === 'lobby') this.stateValue = 'lobby'
      else if (message.phase === 'ended') this.stateValue = 'ended'
      this.emitUpdate()
    } else if (message.type === 'session.started') {
      this.roomPhase = 'playing'
      this.stateValue = 'playing'
      this.emitUpdate('La partida ha comenzado.')
    } else if (message.type === 'session.ended') {
      this.roomPhase = 'ended'
      this.stateValue = 'ended'
      this.stopTimers()
      this.emitUpdate(message.message)
    } else if (message.type === 'input.forward') {
      if (this.role === 'host' && (!this.latestInput || message.input.seq > this.latestInput.input.seq)) this.latestInput = message
    } else if (message.type === 'snapshot') {
      if (this.role !== 'guest' || message.seq <= (this.latestSnapshot?.seq ?? -1)) return
      this.latestSnapshot = { seq: message.seq, hostTime: message.hostTime, snapshot: message.snapshot }
      this.snapshotCount++
      const now = performance.now()
      const elapsed = now - this.lastSnapshotWindowAt
      if (elapsed >= 1_000) {
        this.snapshotsPerSecond = this.snapshotCount * 1_000 / Math.max(1, elapsed)
        this.snapshotCount = 0
        this.lastSnapshotWindowAt = now
      }
    } else if (message.type === 'heartbeat.ack') {
      if (this.lastHeartbeatClientTime === message.clientTime) {
        this.rttToRoomServerMs = Math.max(0, Date.now() - message.clientTime)
        this.lastHeartbeatAckAt = Date.now()
        this.lastHeartbeatClientTime = null
      }
    } else if (message.type === 'server.error') {
      this.message = message.message
      this.emitUpdate()
    }
  }

  private readonly onSocketClose = (event: CloseEvent): void => {
    this.stopTimers()
    if (!this.intentionalClose && this.stateValue !== 'ended') {
      const wasPlaying = this.roomPhase === 'playing'
      this.stateValue = 'closed'
      this.roomPhase = wasPlaying ? 'ended' : this.roomPhase
      this.emitUpdate(wasPlaying
        ? 'Se perdio la conexion. No hay reconexion a partidas empezadas en esta version.'
        : this.closeMessage(event.code))
    }
  }

  private readonly onSocketError = (): void => {
    if (!this.intentionalClose) this.emitUpdate('Se produjo un error de WebSocket.')
  }

  private send(message: NetworkClientMessage): void {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('La sala todavia no esta conectada.')
    const payload = serializeMessage(message)
    socket.send(payload)
    this.messagesSent++
    this.bytesSent += new TextEncoder().encode(payload).byteLength
  }

  private startTimers(): void {
    this.stopTimers()
    this.lastHeartbeatAckAt = Date.now()
    this.metricsStartedAt = performance.now()
    this.heartbeatTimer = window.setInterval(() => {
      if (this.stateValue === 'closed' || this.stateValue === 'ended') return
      if (Date.now() - this.lastHeartbeatAckAt > HEARTBEAT_TIMEOUT_MS) {
        this.socket?.close(4005, 'Heartbeat timeout')
        return
      }
      const clientTime = Date.now()
      this.lastHeartbeatClientTime = clientTime
      try { this.send({ version: NETWORK_PROTOCOL_VERSION, type: 'heartbeat', clientTime }) } catch { /* The socket close handler owns the final state. */ }
    }, HEARTBEAT_INTERVAL_MS)
    this.metricsTimer = window.setInterval(() => this.updateMetricRates(), METRICS_INTERVAL_MS)
  }

  private stopTimers(): void {
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer)
    if (this.metricsTimer !== null) window.clearInterval(this.metricsTimer)
    this.heartbeatTimer = null
    this.metricsTimer = null
  }

  private updateMetricRates(): void {
    const now = performance.now()
    const elapsed = Math.max(1, now - this.metricsStartedAt)
    this.messagesSentPerSecond = this.messagesSent * 1_000 / elapsed
    this.messagesReceivedPerSecond = this.messagesReceived * 1_000 / elapsed
    this.bytesSentPerSecond = this.bytesSent * 1_000 / elapsed
    this.bytesReceivedPerSecond = this.bytesReceived * 1_000 / elapsed
    this.emitUpdate()
  }

  private countReceived(bytes: number): void {
    this.messagesReceived++
    this.bytesReceived += bytes
  }

  private emitUpdate(message?: string): void {
    if (message !== undefined) this.message = message
    const update: MultiplayerClientUpdate = {
      state: this.stateValue,
      roomPhase: this.roomPhase,
      players: this.players,
      message: this.message,
      lastServerMessage: null,
    }
    this.updateListeners.forEach((listener) => listener(update))
  }

  private validateName(name: string): string {
    const result = sanitizeDisplayName(name)
    if (!result) throw new Error('El nombre debe tener entre 2 y 20 caracteres.')
    return result
  }

  private closeMessage(code: number): string {
    if (code === 4001 || code === 4003) return 'El servidor rechazo la credencial de sesion.'
    if (code === 4006) return 'No se puede reconectar a una partida empezada en esta version.'
    if (code === 4004) return 'El anfitrion abandono la sala.'
    return 'La conexion con la sala se cerro.'
  }
}

function isCredentials(value: unknown): value is MultiplayerCredentials {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.roomCode === 'string' && typeof record.token === 'string'
    && /^[a-f0-9]{64}$/.test(record.token) && typeof record.playerId === 'string'
    && (record.role === 'host' || record.role === 'guest') && typeof record.displayName === 'string'
}

function getHttpBase(): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_HTTP_URL
  if (configured) return configured
  if (import.meta.env.DEV && typeof window !== 'undefined') return `http://${window.location.hostname}:8787`
  return typeof window !== 'undefined' ? window.location.origin : ''
}

function getWebSocketBase(httpBase: string): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_WS_URL
  if (configured) return configured
  if (!httpBase) return ''
  return httpBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
}
