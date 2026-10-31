import type { CombatBounds, DamageContext } from './Combat.types'

export interface Damageable {
  readonly combatId: string
  readonly faction: string
  getCombatBounds(): CombatBounds
  applyDamage(context: DamageContext): void
}