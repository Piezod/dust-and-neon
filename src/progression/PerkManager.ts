import type { ProgressionEffectApplier } from './ProgressionEffectApplier'
import type { PerkDefinition, PerkSelectionResult, PerkState } from './Progression.types'
import type { GameEventBus } from '../events/GameEventBus'

export class PerkManager {
  private readonly definitions: ReadonlyMap<string, PerkDefinition>
  private readonly stacks = new Map<string, number>()
  private readonly selectedThisIntermission = new Set<string>()
  private intermissionId: string | null = null
  private choicesUsed = 0
  private readonly effects: ProgressionEffectApplier
  private readonly choicesPerIntermission: number
  private readonly events?: GameEventBus

  constructor(effects: ProgressionEffectApplier, definitions: readonly PerkDefinition[], choicesPerIntermission = 1, events?: GameEventBus) {
    this.effects = effects
    this.choicesPerIntermission = choicesPerIntermission
    this.events = events
    if (!Number.isSafeInteger(choicesPerIntermission) || choicesPerIntermission < 1) throw new RangeError('Perk choices per intermission must be positive')
    this.validateDefinitions(definitions)
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]))
    for (const definition of definitions) this.stacks.set(definition.id, 0)
  }

  beginIntermission(intermissionId: string): void {
    if (this.intermissionId === intermissionId) return
    this.intermissionId = intermissionId
    this.choicesUsed = 0
    this.selectedThisIntermission.clear()
  }

  endIntermission(): void {
    this.intermissionId = null
    this.choicesUsed = 0
    this.selectedThisIntermission.clear()
  }

  getDefinitions(): readonly PerkDefinition[] {
    return Array.from(this.definitions.values())
  }

  getStates(): readonly PerkState[] {
    return Array.from(this.definitions.values(), (definition) => {
      const stacks = this.stacks.get(definition.id) ?? 0
      return {
        id: definition.id,
        stacks,
        maxStacks: definition.maxStacks,
        selectedThisIntermission: this.selectedThisIntermission.has(definition.id),
        canSelect: this.intermissionId !== null && this.choicesUsed < this.choicesPerIntermission && stacks < definition.maxStacks,
      }
    })
  }

  select(id: string): PerkSelectionResult {
    const definition = this.definitions.get(id)
    if (!definition) return { selected: false, perkId: id, reason: 'unknown-perk' }
    if (this.intermissionId === null) return { selected: false, perkId: id, reason: 'intermission-closed' }
    const currentStacks = this.stacks.get(id) ?? 0
    if (definition.stackingRule === 'unique' && currentStacks > 0) return { selected: false, perkId: id, reason: 'already-selected' }
    if (currentStacks >= definition.maxStacks) return { selected: false, perkId: id, reason: 'max-stacks' }
    if (this.choicesUsed >= this.choicesPerIntermission) return { selected: false, perkId: id, reason: 'choice-limit' }
    const nextStack = currentStacks + 1
    this.effects.apply(`perk:${id}:${nextStack}`, definition.effects)
    this.stacks.set(id, nextStack)
    this.choicesUsed++
    this.selectedThisIntermission.add(id)
    this.events?.emit({ type: 'perk-selected', perkId: id, stacks: nextStack, soundId: definition.sounds?.select })
    return { selected: true, perkId: id, stacks: nextStack }
  }

  reset(): void {
    for (const [id, count] of this.stacks) {
      for (let stack = 1; stack <= count; stack++) this.effects.remove(`perk:${id}:${stack}`)
      this.stacks.set(id, 0)
    }
    this.endIntermission()
  }

  private validateDefinitions(definitions: readonly PerkDefinition[]): void {
    const ids = new Set<string>()
    for (const definition of definitions) {
      if (!definition.id || ids.has(definition.id)) throw new Error(`Invalid or duplicate perk id: ${definition.id}`)
      ids.add(definition.id)
      if (!Number.isSafeInteger(definition.maxStacks) || definition.maxStacks < 1 || definition.effects.length === 0) {
        throw new RangeError(`Perk ${definition.id} has invalid stacking or effects`)
      }
      if (definition.stackingRule === 'unique' && definition.maxStacks !== 1) throw new Error(`Unique perk ${definition.id} must have maxStacks 1`)
    }
  }
}