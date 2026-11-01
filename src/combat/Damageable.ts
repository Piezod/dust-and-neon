import type { CombatBounds, DamageContext, DamageStatusApplication, DamageType } from './Combat.types'

export interface Damageable {
  readonly combatId: string
  readonly faction: string
  getCombatBounds(): CombatBounds
  applyDamage(context: DamageContext): void
  getDamageMultiplier?(type: DamageType, sourcePosition?: readonly [number, number, number]): number
  applyStatusEffect?(effect: DamageStatusApplication, source: { readonly id: string; readonly faction: string }): void
}