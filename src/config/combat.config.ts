import type { AttackDefinition, CombatSource } from '../combat/Combat.types'

export const REVOLVER_ATTACK: AttackDefinition = Object.freeze({
  id: 'player.revolver',
  name: 'Revólver',
  damage: 15,
  shotsPerSecond: 2,
  projectileSpeed: 25,
  maxRange: 20,
  projectileRadius: 0.18,
  damageType: 'physical',
})

export const PLAYER_COMBAT_SOURCE: CombatSource = Object.freeze({ id: 'player', faction: 'player' })