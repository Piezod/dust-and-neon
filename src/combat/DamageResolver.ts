import type { Damageable } from './Damageable'
import type { DamageContext } from './Combat.types'

export class DamageResolver {
  apply(target: Damageable, context: DamageContext): boolean {
    if (target.combatId === context.sourceId || target.faction === context.sourceFaction) return false
    if (!Number.isFinite(context.amount) || context.amount <= 0) return false
    target.applyDamage(context)
    return true
  }
}