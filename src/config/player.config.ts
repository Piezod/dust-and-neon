import type { CharacterStatValues } from '../core/CharacterStats.types'

export const PLAYER_BASE_STATS: Readonly<CharacterStatValues> = Object.freeze({
  maxHealth: 100,
  moveSpeed: 5.5,
  attackDamage: 15,
  maxEnergy: 100,
  defense: 0,
  criticalChance: 0.05,
})