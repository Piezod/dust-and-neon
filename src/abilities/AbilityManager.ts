import type { Ability } from './Ability'
import type {
  AbilityActivationContext,
  AbilityActivationResult,
  AbilityId,
  AbilityMovement,
  AbilityState,
} from './Ability.types'

export class AbilityManager {
  private readonly abilities = new Map<AbilityId, Ability>()

  constructor(factories: readonly (() => Ability)[]) {
    for (const factory of factories) this.register(factory())
  }

  register(ability: Ability): void {
    if (this.abilities.has(ability.id)) throw new Error(`Duplicate ability id: ${ability.id}`)
    this.abilities.set(ability.id, ability)
  }

  get(id: AbilityId): Ability | undefined {
    return this.abilities.get(id)
  }

  getInputBindings(): readonly { readonly id: AbilityId; readonly inputCode: string }[] {
    return Array.from(this.abilities.values(), ({ id, definition }) => ({ id, inputCode: definition.inputCode }))
  }

  getStates(): readonly AbilityState[] {
    return Array.from(this.abilities.values(), (ability) => ability.getState())
  }

  tryActivate(id: AbilityId, context: AbilityActivationContext = {}): AbilityActivationResult {
    const ability = this.abilities.get(id)
    if (!ability) return { activated: false, abilityId: id, reason: 'unknown-ability' }
    return ability.activate(context)
  }

  update(deltaTime: number): void {
    for (const ability of this.abilities.values()) ability.update(deltaTime)
  }

  cancelAll(): void {
    for (const ability of this.abilities.values()) ability.cancel()
  }

  consumeMovement(deltaTime: number): AbilityMovement | null {
    for (const ability of this.abilities.values()) {
      const movement = ability.consumeMovement(deltaTime)
      if (movement) return movement
    }
    return null
  }
}