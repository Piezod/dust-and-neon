import {
  MAX_WIRE_MESSAGE_BYTES,
  NETWORK_PROTOCOL_VERSION,
  generateRoomCode,
  isValidRoomCode,
  parseClientMessage,
  parseServerMessage,
  sanitizeDisplayName,
  type NetworkSnapshot,
} from './protocol'

export function runNetworkProtocolChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const validInput = {
    version: NETWORK_PROTOCOL_VERSION, type: 'input', seq: 4, clientTime: 1234,
    moveX: 0.5, moveZ: -1, aimX: 1, aimZ: 0, fire: true, dash: false,
  }
  const snapshot: NetworkSnapshot = {
    phase: 'combat', wave: 2, enemiesRemaining: 1, breakSeconds: 0, survivalSeconds: 42,
    players: [{ id: 'guest-1', displayName: 'Player 2', x: 1, z: 2, angle: 0.4, health: 80, maxHealth: 100, energy: 90, maxEnergy: 100, alive: true, connected: true, kills: 3, gold: 15, inputAck: 4 }],
    enemies: [{ id: 'alien-crawler:1', definitionId: 'alien-crawler', x: -3, z: 4, angle: 1, health: 20, maxHealth: 50 }],
    projectiles: [], pickups: [], boss: null, confirmedEvents: [], result: null,
  }
  const hostSnapshot = { version: NETWORK_PROTOCOL_VERSION, type: 'snapshot', seq: 9, hostTime: 3000, snapshot }
  check(isValidRoomCode(generateRoomCode()), 'Generated room codes use the valid private-room alphabet')
  check(new Set(Array.from({ length: 64 }, () => generateRoomCode())).size === 64, 'Room code generator does not repeat a 64-code sample')
  check(!isValidRoomCode('111111111111') && !isValidRoomCode('bad'), 'Ambiguous or malformed room codes are rejected')
  check(sanitizeDisplayName('  Dust Rider  ') === 'Dust Rider', 'Names are trimmed before admission')
  check(sanitizeDisplayName('<>\n') === null, 'Names reject markup/control-only content')
  check((parseClientMessage(JSON.stringify(validInput)) as { seq?: number } | null)?.seq === 4, 'Valid sequenced player input is accepted')
  check(parseClientMessage(JSON.stringify({ ...validInput, version: 2 })) === null, 'Unknown protocol versions are rejected')
  check(parseClientMessage(JSON.stringify({ ...validInput, moveX: 4 })) === null, 'Out-of-range movement is rejected')
  check(parseClientMessage(JSON.stringify({ ...validInput, aimX: 0, aimZ: 0 })) === null, 'Zero-length aim vectors are rejected')
  check(parseClientMessage(JSON.stringify({ ...validInput, dash: 1 })) === null, 'Action fields must use their declared scalar types')
  check(parseClientMessage(JSON.stringify(hostSnapshot))?.type === 'snapshot', 'Versioned bounded host snapshots are accepted')
  check(parseClientMessage(JSON.stringify({ ...hostSnapshot, snapshot: { ...snapshot, enemies: Array.from({ length: 25 }, (_, index) => ({ id: `e-${index}`, definitionId: 'alien-crawler', x: 0, z: 0, angle: 0, health: 1, maxHealth: 1 })) } })) === null, 'Enemy entity limits are enforced')
  check(parseServerMessage(JSON.stringify({ version: 1, type: 'room.state', phase: 'lobby', players: [{ id: 'h-1', displayName: 'Host', role: 'host', connected: true }] }))?.type === 'room.state', 'Valid lobby state is accepted')
  check(parseServerMessage(JSON.stringify({ version: 1, type: 'room.state', phase: 'lobby', players: [{ id: 'h-1', displayName: 'Host', role: 'admin', connected: true }] })) === null, 'Unexpected room roles are rejected')
  check(parseServerMessage(JSON.stringify({ version: 1, type: 'server.error', code: 'ROOM_FULL', message: 'Sala llena', retryable: false }))?.type === 'server.error', 'Structured server errors are accepted')
  check(parseClientMessage('x'.repeat(MAX_WIRE_MESSAGE_BYTES + 1)) === null, 'Oversized wire messages are rejected before parsing')
  let oversizedRejected = false
  try {
    const oversized = { version: 1, type: 'snapshot', seq: 1, hostTime: 1, snapshot: { ...snapshot, confirmedEvents: [{ id: 1, event: { type: 'x', data: 'x'.repeat(MAX_WIRE_MESSAGE_BYTES) } }] } }
    parseClientMessage(JSON.stringify(oversized))
  } catch { oversizedRejected = true }
  check(oversizedRejected || parseClientMessage(JSON.stringify({ ...hostSnapshot, snapshot: { ...snapshot, confirmedEvents: Array.from({ length: 49 }, (_, id) => ({ id, event: { type: 'x' } })) } })) === null, 'Snapshots with excessive event payloads are rejected')
  return `${checks} network protocol checks passed`
}
