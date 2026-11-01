import type { CharacterStats } from '../core/CharacterStats'
import type { CombatSystem } from '../combat/CombatSystem'
import type { ProgressionEffect } from './Progression.types'

interface AppliedModifier {
  readonly id: string
  readonly target: ProgressionEffect['target']
}

export class ProgressionEffectApplier {
  private readonly owners = new Map<string, readonly AppliedModifier[]>()
  private readonly stats: CharacterStats
  private readonly combat: CombatSystem

  constructor(stats: CharacterStats, combat: CombatSystem) {
    this.stats = stats
    this.combat = combat
  }

  apply(ownerId: string, effects: readonly ProgressionEffect[]): void {
    if (!ownerId || this.owners.has(ownerId)) throw new Error(`Progression effect owner already applied: ${ownerId}`)
    const applied: AppliedModifier[] = []
    try {
      for (let index = 0; index < effects.length; index++) {
        const effect = effects[index]
        const id = `${ownerId}:${index}`
        if (effect.target === 'character') {
          this.stats.addModifier({ id, stat: effect.stat, flat: effect.flat, percentage: effect.percentage })
        } else {
          this.combat.addAttackModifier({ id, stat: effect.stat, flat: effect.flat, percentage: effect.percentage })
        }
        applied.push({ id, target: effect.target })
      }
      this.owners.set(ownerId, applied)
    } catch (error) {
      for (const modifier of applied.reverse()) this.removeModifier(modifier.id, modifier.target)
      throw error
    }
  }

  remove(ownerId: string): boolean {
    const modifierIds = this.owners.get(ownerId)
    if (!modifierIds) return false
    for (const modifier of modifierIds) this.removeModifier(modifier.id, modifier.target)
    this.owners.delete(ownerId)
    return true
  }

  reset(): void {
    for (const ownerId of Array.from(this.owners.keys())) this.remove(ownerId)
  }

  private removeModifier(id: string, target: ProgressionEffect['target'] | undefined): void {
    if (target === 'character') this.stats.removeModifier(id)
    else if (target === 'weapon') this.combat.removeAttackModifier(id)
  }
}