export const NETWORK_PROTOCOL_VERSION = 1 as const
export const MAX_WIRE_MESSAGE_BYTES = 48 * 1024
export const MAX_ROOM_PLAYERS = 2
export const MAX_NETWORK_ENEMIES = 24
export const MAX_NETWORK_PROJECTILES = 96
export const MAX_NETWORK_PICKUPS = 48
export const MAX_CONFIRMED_EVENTS = 48

export type NetworkRole = 'host' | 'guest'
export type NetworkRoomPhase = 'lobby' | 'playing' | 'ended'
export type NetworkGamePhase = 'preparing' | 'combat' | 'intermission' | 'boss' | 'game-over'

export interface NetworkRoomPlayer {
  readonly id: string
  readonly displayName: string
  readonly role: NetworkRole
  readonly connected: boolean
}

export interface NetworkPlayerState {
  readonly id: string
  readonly displayName: string
  readonly x: number
  readonly z: number
  readonly angle: number
  readonly health: number
  readonly maxHealth: number
  readonly energy: number
  readonly maxEnergy: number
  readonly alive: boolean
  readonly connected: boolean
  readonly kills: number
  readonly gold: number
  readonly inputAck: number
}

export interface NetworkEnemyState {
  readonly id: string
  readonly definitionId: string
  readonly x: number
  readonly z: number
  readonly angle: number
  readonly health: number
  readonly maxHealth: number
}

export interface NetworkProjectileState {
  readonly id: string
  readonly definitionId: string
  readonly x: number
  readonly y: number
  readonly z: number
  readonly directionX: number
  readonly directionZ: number
  readonly faction: string
}

export interface NetworkPickupState {
  readonly id: string
  readonly type: 'health' | 'energy' | 'gold'
  readonly quantity: number
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface NetworkBossState {
  readonly id: string
  readonly name: string
  readonly x: number
  readonly z: number
  readonly health: number
  readonly maxHealth: number
  readonly phaseId: string
  readonly phaseIndex: number
  readonly phaseCount: number
}

export interface NetworkConfirmedEvent {
  readonly id: number
  readonly event: Readonly<Record<string, unknown>>
}

export interface NetworkGameResult {
  readonly wavesSurvived: number
  readonly survivalSeconds: number
  readonly kills: readonly { readonly playerId: string; readonly count: number }[]
}

export interface NetworkSnapshot {
  readonly phase: NetworkGamePhase
  readonly wave: number
  readonly enemiesRemaining: number
  readonly breakSeconds: number
  readonly survivalSeconds: number
  readonly players: readonly NetworkPlayerState[]
  readonly enemies: readonly NetworkEnemyState[]
  readonly projectiles: readonly NetworkProjectileState[]
  readonly pickups: readonly NetworkPickupState[]
  readonly boss: NetworkBossState | null
  readonly confirmedEvents: readonly NetworkConfirmedEvent[]
  readonly result: NetworkGameResult | null
}

export interface NetworkInput {
  readonly version: typeof NETWORK_PROTOCOL_VERSION
  readonly type: 'input'
  readonly seq: number
  readonly clientTime: number
  readonly moveX: number
  readonly moveZ: number
  readonly aimX: number
  readonly aimZ: number
  readonly fire: boolean
  readonly dash: boolean
}

export interface NetworkAuthMessage {
  readonly version: typeof NETWORK_PROTOCOL_VERSION
  readonly type: 'auth'
  readonly token: string
}

export interface NetworkHostCommand {
  readonly version: typeof NETWORK_PROTOCOL_VERSION
  readonly type: 'lobby.start' | 'lobby.reset' | 'lobby.leave'
  readonly seq: number
}

export interface NetworkHeartbeat {
  readonly version: typeof NETWORK_PROTOCOL_VERSION
  readonly type: 'heartbeat'
  readonly clientTime: number
}

export interface NetworkHostSnapshotMessage {
  readonly version: typeof NETWORK_PROTOCOL_VERSION
  readonly type: 'snapshot'
  readonly seq: number
  readonly hostTime: number
  readonly snapshot: NetworkSnapshot
}

export type NetworkClientMessage = NetworkAuthMessage | NetworkHostCommand | NetworkHeartbeat | NetworkInput | NetworkHostSnapshotMessage

export type NetworkServerMessage =
  | { readonly version: typeof NETWORK_PROTOCOL_VERSION; readonly type: 'session.ready'; readonly roomCode: string; readonly role: NetworkRole; readonly playerId: string; readonly phase: NetworkRoomPhase; readonly players: readonly NetworkRoomPlayer[] }
  | { readonly version: typeof NETWORK_PROTOCOL_VERSION; readonly type: 'room.state'; readonly phase: NetworkRoomPhase; readonly players: readonly NetworkRoomPlayer[] }
  | { readonly version: typeof NETWORK_PROTOCOL_VERSION; readonly type: 'session.started' }
  | { readonly version: typeof NETWORK_PROTOCOL_VERSION; readonly type: 'session.ended'; readonly reason: 'host-left' | 'empty' | 'cancelled'; readonly message: string }
  | { readonly version: typeof NETWORK_PROTOCOL_VERSION; readonly type: 'input.forward'; readonly playerId: string; readonly input: NetworkInput }
  | { readonly version: typeof NETWORK_PROTOCOL_VERSION; readonly type: 'snapshot'; readonly seq: number; readonly hostTime: number; readonly snapshot: NetworkSnapshot }
  | { readonly version: typeof NETWORK_PROTOCOL_VERSION; readonly type: 'heartbeat.ack'; readonly clientTime: number; readonly serverTime: number }
  | { readonly version: typeof NETWORK_PROTOCOL_VERSION; readonly type: 'server.error'; readonly code: string; readonly message: string; readonly retryable: boolean }

const ROOM_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function isValidRoomCode(value: unknown): value is string {
  return typeof value === 'string' && value.length === 12 && [...value].every((character) => ROOM_ALPHABET.includes(character))
}

export function sanitizeDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 20)
  return normalized.length >= 2 ? normalized : null
}

export function generateRoomCode(random: Crypto = crypto): string {
  const bytes = random.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('')
}

export function generateSessionToken(random: Crypto = crypto): string {
  const bytes = random.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function serializeMessage(message: NetworkClientMessage | NetworkServerMessage): string {
  const serialized = JSON.stringify(message)
  if (new TextEncoder().encode(serialized).byteLength > MAX_WIRE_MESSAGE_BYTES) throw new RangeError('Network message is too large')
  return serialized
}

export function parseClientMessage(data: string | ArrayBuffer): NetworkClientMessage | null {
  try {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
    if (new TextEncoder().encode(text).byteLength > MAX_WIRE_MESSAGE_BYTES) return null
    const value: unknown = JSON.parse(text)
    if (!isRecord(value) || value.version !== NETWORK_PROTOCOL_VERSION || typeof value.type !== 'string') return null
    if (value.type === 'auth') return typeof value.token === 'string' && /^[a-f0-9]{64}$/.test(value.token) ? value as unknown as NetworkAuthMessage : null
    if (value.type === 'lobby.start' || value.type === 'lobby.reset' || value.type === 'lobby.leave') {
      return isSequence(value.seq) ? value as unknown as NetworkHostCommand : null
    }
    if (value.type === 'heartbeat') return isFiniteNumber(value.clientTime) ? value as unknown as NetworkHeartbeat : null
    if (value.type === 'input') return isValidInput(value) ? value as unknown as NetworkInput : null
    if (value.type === 'snapshot') return isValidHostSnapshot(value) ? value as unknown as NetworkHostSnapshotMessage : null
    return null
  } catch {
    return null
  }
}

export function parseServerMessage(data: string | ArrayBuffer): NetworkServerMessage | null {
  try {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
    if (new TextEncoder().encode(text).byteLength > MAX_WIRE_MESSAGE_BYTES) return null
    const value: unknown = JSON.parse(text)
    if (!isRecord(value) || value.version !== NETWORK_PROTOCOL_VERSION || typeof value.type !== 'string') return null
    if (value.type === 'session.ready') {
      return isValidRoomCode(value.roomCode) && isOneOf(value.role, ['host', 'guest']) && isSafeId(value.playerId)
        && isOneOf(value.phase, ['lobby', 'playing', 'ended']) && isRoomRoster(value.players)
        ? value as unknown as NetworkServerMessage : null
    }
    if (value.type === 'room.state') {
      return isOneOf(value.phase, ['lobby', 'playing', 'ended']) && isRoomRoster(value.players)
        ? value as unknown as NetworkServerMessage : null
    }
    if (value.type === 'session.started') return value as unknown as NetworkServerMessage
    if (value.type === 'session.ended') {
      return isOneOf(value.reason, ['host-left', 'empty', 'cancelled']) && typeof value.message === 'string' && value.message.length <= 160
        ? value as unknown as NetworkServerMessage : null
    }
    if (value.type === 'input.forward') {
      return isSafeId(value.playerId) && isValidInput(value.input as Record<string, unknown>)
        ? value as unknown as NetworkServerMessage : null
    }
    if (value.type === 'snapshot') {
      return isSequence(value.seq) && isBoundedNumber(value.hostTime, 0, 9_999_999_999_999) && isValidSnapshot(value.snapshot)
        ? value as unknown as NetworkServerMessage : null
    }
    if (value.type === 'heartbeat.ack') {
      return isFiniteNumber(value.clientTime) && isFiniteNumber(value.serverTime)
        ? value as unknown as NetworkServerMessage : null
    }
    if (value.type === 'server.error') {
      return typeof value.code === 'string' && value.code.length <= 64
        && typeof value.message === 'string' && value.message.length <= 200 && typeof value.retryable === 'boolean'
        ? value as unknown as NetworkServerMessage : null
    }
    return null
  } catch {
    return null
  }
}

export function isValidSnapshot(value: unknown): value is NetworkSnapshot {
  if (!isRecord(value) || !isOneOf(value.phase, ['preparing', 'combat', 'intermission', 'boss', 'game-over'])) return false
  if (!isBoundedInteger(value.wave, 0, 1_000_000) || !isBoundedInteger(value.enemiesRemaining, 0, MAX_NETWORK_ENEMIES)) return false
  if (!isBoundedNumber(value.breakSeconds, 0, 60) || !isBoundedNumber(value.survivalSeconds, 0, 31_536_000)) return false
  if (!Array.isArray(value.players) || value.players.length > MAX_ROOM_PLAYERS || !value.players.every(isNetworkPlayer)) return false
  if (!Array.isArray(value.enemies) || value.enemies.length > MAX_NETWORK_ENEMIES || !value.enemies.every(isNetworkEnemy)) return false
  if (!Array.isArray(value.projectiles) || value.projectiles.length > MAX_NETWORK_PROJECTILES || !value.projectiles.every(isNetworkProjectile)) return false
  if (!Array.isArray(value.pickups) || value.pickups.length > MAX_NETWORK_PICKUPS || !value.pickups.every(isNetworkPickup)) return false
  if (value.boss !== null && !isNetworkBoss(value.boss)) return false
  if (!Array.isArray(value.confirmedEvents) || value.confirmedEvents.length > MAX_CONFIRMED_EVENTS || !value.confirmedEvents.every(isConfirmedEvent)) return false
  if (value.result !== null && !isNetworkResult(value.result)) return false
  return true
}

function isValidInput(value: Record<string, unknown>): boolean {
  return isSequence(value.seq) && isBoundedNumber(value.clientTime, 0, 9_999_999_999_999)
    && isBoundedNumber(value.moveX, -1, 1) && isBoundedNumber(value.moveZ, -1, 1)
    && isBoundedNumber(value.aimX, -1, 1) && isBoundedNumber(value.aimZ, -1, 1)
    && Math.hypot(value.aimX as number, value.aimZ as number) >= 0.5
    && Math.hypot(value.aimX as number, value.aimZ as number) <= 1.5
    && typeof value.fire === 'boolean' && typeof value.dash === 'boolean'
}

function isValidHostSnapshot(value: Record<string, unknown>): boolean {
  return isSequence(value.seq) && isBoundedNumber(value.hostTime, 0, 9_999_999_999_999) && isValidSnapshot(value.snapshot)
}

function isNetworkPlayer(value: unknown): boolean {
  return isRecord(value) && isSafeId(value.id) && typeof value.displayName === 'string' && value.displayName.length <= 20
    && isBoundedNumber(value.x, -100, 100) && isBoundedNumber(value.z, -100, 100)
    && isBoundedNumber(value.angle, -Math.PI * 4, Math.PI * 4)
    && isBoundedNumber(value.health, 0, 10_000) && isBoundedNumber(value.maxHealth, 1, 10_000)
    && isBoundedNumber(value.energy, 0, 10_000) && isBoundedNumber(value.maxEnergy, 1, 10_000)
    && value.health as number <= (value.maxHealth as number)
    && value.energy as number <= (value.maxEnergy as number)
    && typeof value.alive === 'boolean' && typeof value.connected === 'boolean'
    && isBoundedInteger(value.kills, 0, 1_000_000) && isSequence(value.gold) && isSequence(value.inputAck)
}

function isRoomRoster(value: unknown): value is NetworkRoomPlayer[] {
  return Array.isArray(value) && value.length <= MAX_ROOM_PLAYERS && value.every((player) => isRecord(player)
    && isSafeId(player.id) && typeof player.displayName === 'string' && player.displayName.length <= 20
    && isOneOf(player.role, ['host', 'guest']) && typeof player.connected === 'boolean')
}

function isNetworkEnemy(value: unknown): boolean {
  return isRecord(value) && isSafeId(value.id) && isSafeId(value.definitionId)
    && isBoundedNumber(value.x, -100, 100) && isBoundedNumber(value.z, -100, 100)
    && isBoundedNumber(value.angle, -Math.PI * 4, Math.PI * 4)
    && isBoundedNumber(value.health, 0, 100_000) && isBoundedNumber(value.maxHealth, 1, 100_000)
    && (value.health as number) <= (value.maxHealth as number)
}

function isNetworkProjectile(value: unknown): boolean {
  return isRecord(value) && isSafeId(value.id) && isSafeId(value.definitionId)
    && isBoundedNumber(value.x, -120, 120) && isBoundedNumber(value.y, 0, 12) && isBoundedNumber(value.z, -120, 120)
    && isBoundedNumber(value.directionX, -1, 1) && isBoundedNumber(value.directionZ, -1, 1)
    && Math.hypot(value.directionX as number, value.directionZ as number) <= 1.5
    && typeof value.faction === 'string' && value.faction.length <= 24
}

function isNetworkPickup(value: unknown): boolean {
  return isRecord(value) && isSafeId(value.id) && isOneOf(value.type, ['health', 'energy', 'gold'])
    && isBoundedInteger(value.quantity, 1, 1_000_000)
    && isBoundedNumber(value.x, -100, 100) && isBoundedNumber(value.y, 0, 4) && isBoundedNumber(value.z, -100, 100)
}

function isNetworkBoss(value: unknown): boolean {
  return isRecord(value) && isSafeId(value.id) && typeof value.name === 'string' && value.name.length <= 64
    && isBoundedNumber(value.x, -100, 100) && isBoundedNumber(value.z, -100, 100)
    && isBoundedNumber(value.health, 0, 100_000) && isBoundedNumber(value.maxHealth, 1, 100_000)
    && value.health as number <= (value.maxHealth as number)
    && typeof value.phaseId === 'string' && value.phaseId.length <= 64
    && isBoundedInteger(value.phaseIndex, 0, 16) && isBoundedInteger(value.phaseCount, 1, 16)
    && value.phaseIndex as number < (value.phaseCount as number)
}

function isConfirmedEvent(value: unknown): boolean {
  return isRecord(value) && isSequence(value.id) && isRecord(value.event)
    && typeof value.event.type === 'string' && value.event.type.length <= 48
}

function isNetworkResult(value: unknown): boolean {
  return isRecord(value) && isBoundedInteger(value.wavesSurvived, 0, 1_000_000)
    && isBoundedNumber(value.survivalSeconds, 0, 31_536_000)
    && Array.isArray(value.kills) && value.kills.length <= MAX_ROOM_PLAYERS
    && value.kills.every((entry) => isRecord(entry) && isSafeId(entry.playerId) && isBoundedInteger(entry.count, 0, 1_000_000))
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 && /^[a-zA-Z0-9:_-]+$/.test(value)
}

function isSequence(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBoundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return isFiniteNumber(value) && value >= minimum && value <= maximum
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
}

function isOneOf<const T extends readonly string[]>(value: unknown, choices: T): value is T[number] {
  return typeof value === 'string' && choices.includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
