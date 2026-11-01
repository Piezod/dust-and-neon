import type {
  NetworkInput,
  NetworkRole,
  NetworkRoomPhase,
  NetworkRoomPlayer,
  NetworkSnapshot,
} from './protocol'
import type { MultiplayerConnectionState, MultiplayerDiagnostics } from './MultiplayerClient'

export type NetworkInputFields = Omit<NetworkInput, 'version' | 'type' | 'seq' | 'clientTime'>

export interface MultiplayerGameBridge {
  readonly role: NetworkRole | null
  readonly playerId: string | null
  readonly displayName: string | null
  readonly connectionState: MultiplayerConnectionState
  readonly roomPhaseStatus: NetworkRoomPhase | null
  readonly connectedPlayers: readonly NetworkRoomPlayer[]
  readonly currentSnapshot: NetworkSnapshot | null
  readonly currentSnapshotSequence: number
  getLatestInput(): Extract<import('./protocol').NetworkServerMessage, { type: 'input.forward' }> | null
  getDiagnostics(): MultiplayerDiagnostics
  sendInput(input: NetworkInputFields): void
  sendSnapshot(snapshot: NetworkSnapshot, hostTime?: number): void
}
