import type { Damageable } from './Damageable'
import type { DamageContext } from './Combat.types'

export class DamageResolver {
  apply(target: Damageable, context: DamageContext): boolean {
    if (target.combatId === context.sourceId || target.faction === context.sourceFaction) return false
    if (!Number.isFinite(context.amount) || context.amount <= 0) return false
    const multiplier = target.getDamageMultiplier?.(context.type, context.sourcePosition) ?? 1
    if (!Number.isFinite(multiplier) || multiplier <= 0) return false
    target.applyDamage({ ...context, amount: context.amount * multiplier })
    for (const effect of context.effects ?? []) target.applyStatusEffect?.(effect, { id: context.sourceId, faction: context.sourceFaction })
    return true
  }
}