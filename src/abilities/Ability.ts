import type { CharacterStats } from '../core/CharacterStats'
import type {
  AbilityActivationContext,
  AbilityActivationResult,
  AbilityDefinition,
  AbilityId,
  AbilityMovement,
  AbilityRejectionReason,
  AbilityState,
} from './Ability.types'

export abstract class Ability {
  private cooldownRemaining = 0
  protected active = false
  readonly definition: AbilityDefinition
  protected readonly stats: CharacterStats

  protected constructor(definition: AbilityDefinition, stats: CharacterStats) {
    this.definition = definition
    this.stats = stats
    if (!definition.id || !definition.name || !definition.inputCode) throw new Error('Ability identity and input are required')
    if (!Number.isFinite(definition.energyCost) || definition.energyCost < 0) throw new RangeError('Ability energy cost must be non-negative and finite')
    if (!Number.isFinite(definition.cooldownSeconds) || definition.cooldownSeconds < 0) throw new RangeError('Ability cooldown must be non-negative and finite')
  }

  get id(): AbilityId {
    return this.definition.id
  }

  getState(): AbilityState {
    const energySufficient = this.stats.currentEnergy >= this.definition.energyCost
    return {
      id: this.id,
      name: this.definition.name,
      inputLabel: this.definition.inputLabel,
      active: this.active,
      available: this.stats.isAlive && !this.active && this.cooldownRemaining === 0 && energySufficient,
      energySufficient,
      cooldownRemaining: this.cooldownRemaining,
      energyCost: this.definition.energyCost,
    }
  }

  activate(context: AbilityActivationContext = {}): AbilityActivationResult {
    const reason = this.getRejectionReason()
    if (reason) return { activated: false, abilityId: this.id, reason }
    if (!this.stats.spendEnergy(this.definition.energyCost)) {
      return { activated: false, abilityId: this.id, reason: 'insufficient-energy' }
    }
    this.cooldownRemaining = this.definition.cooldownSeconds
    this.onActivate(context)
    return { activated: true, abilityId: this.id }
  }

  update(deltaTime: number): void {
    if (!this.stats.isAlive) {
      this.cancel()
      return
    }
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - elapsed)
    this.onUpdate(elapsed)
  }

  consumeMovement(_deltaTime: number): AbilityMovement | null {
    return null
  }

  cancel(): void {
    if (!this.active) return
    this.active = false
    this.onCancel()
  }

  protected abstract onActivate(context: AbilityActivationContext): void

  protected onCancel(): void {}

  protected onUpdate(_deltaTime: number): void {}

  private getRejectionReason(): AbilityRejectionReason | null {
    if (!this.stats.isAlive) return 'dead'
    if (this.active) return 'already-active'
    if (this.cooldownRemaining > 0) return 'cooldown'
    if (this.stats.currentEnergy < this.definition.energyCost) return 'insufficient-energy'
    return null
  }
}