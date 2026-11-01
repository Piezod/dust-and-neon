import type { Wallet } from '../loot/Wallet'
import type { ProgressionEffectApplier } from './ProgressionEffectApplier'
import type { UpgradeDefinition, UpgradePurchaseResult, UpgradeState } from './Progression.types'
import type { GameEventBus } from '../events/GameEventBus'

export class UpgradeManager {
  private readonly definitions: ReadonlyMap<string, UpgradeDefinition>
  private readonly levels = new Map<string, number>()
  private purchasesAllowed = false
  private readonly wallet: Wallet
  private readonly effects: ProgressionEffectApplier
  private readonly events?: GameEventBus

  constructor(wallet: Wallet, effects: ProgressionEffectApplier, definitions: readonly UpgradeDefinition[], events?: GameEventBus) {
    this.wallet = wallet
    this.effects = effects
    this.events = events
    this.validateDefinitions(definitions)
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]))
    for (const definition of definitions) this.levels.set(definition.id, 0)
  }

  setPurchasesAllowed(allowed: boolean): void {
    this.purchasesAllowed = allowed
  }

  getDefinitions(): readonly UpgradeDefinition[] {
    return Array.from(this.definitions.values())
  }

  getLevel(id: string): number {
    return this.levels.get(id) ?? 0
  }

  getStates(): readonly UpgradeState[] {
    return Array.from(this.definitions.values(), (definition) => ({
      id: definition.id,
      level: this.getLevel(definition.id),
      maxLevel: definition.maxLevel,
      cost: definition.cost,
      canPurchase: this.canPurchase(definition),
    }))
  }

  purchase(id: string): UpgradePurchaseResult {
    const definition = this.definitions.get(id)
    if (!definition) return { purchased: false, upgradeId: id, reason: 'unknown-upgrade' }
    if (!this.purchasesAllowed) return { purchased: false, upgradeId: id, reason: 'wrong-state' }
    const level = this.getLevel(id)
    if (level >= definition.maxLevel) return { purchased: false, upgradeId: id, reason: 'max-level' }
    if (!this.requirementsMet(definition)) return { purchased: false, upgradeId: id, reason: 'requirements' }
    if (!this.wallet.spend(definition.cost)) return { purchased: false, upgradeId: id, reason: 'insufficient-gold' }
    const nextLevel = level + 1
    try {
      this.effects.apply(`upgrade:${id}:${nextLevel}`, definition.effects)
      this.levels.set(id, nextLevel)
      this.events?.emit({ type: 'upgrade-purchased', upgradeId: id, level: nextLevel })
      return { purchased: true, upgradeId: id, level: nextLevel }
    } catch (error) {
      this.wallet.add(definition.cost)
      throw error
    }
  }

  reset(): void {
    for (const [id, level] of this.levels) {
      for (let appliedLevel = 1; appliedLevel <= level; appliedLevel++) this.effects.remove(`upgrade:${id}:${appliedLevel}`)
      this.levels.set(id, 0)
    }
    this.purchasesAllowed = false
  }

  private canPurchase(definition: UpgradeDefinition): boolean {
    return this.purchasesAllowed
      && this.getLevel(definition.id) < definition.maxLevel
      && this.requirementsMet(definition)
      && this.wallet.canAfford(definition.cost)
  }

  private requirementsMet(definition: UpgradeDefinition): boolean {
    return (definition.requirements ?? []).every((requirement) => this.getLevel(requirement.upgradeId) >= requirement.level)
  }

  private validateDefinitions(definitions: readonly UpgradeDefinition[]): void {
    const ids = new Set<string>()
    for (const definition of definitions) {
      if (!definition.id || ids.has(definition.id)) throw new Error(`Invalid or duplicate upgrade id: ${definition.id}`)
      ids.add(definition.id)
      if (!Number.isSafeInteger(definition.cost) || definition.cost < 0 || !Number.isSafeInteger(definition.maxLevel) || definition.maxLevel < 1) {
        throw new RangeError(`Upgrade ${definition.id} has invalid cost or max level`)
      }
      if (definition.effects.length === 0) throw new Error(`Upgrade ${definition.id} must define at least one effect`)
      for (const effect of definition.effects) {
        if (!Number.isFinite(effect.flat ?? 0) || !Number.isFinite(effect.percentage ?? 0)) throw new RangeError(`Upgrade ${definition.id} has a non-finite effect`)
      }
    }
    for (const definition of definitions) {
      for (const requirement of definition.requirements ?? []) {
        if (!ids.has(requirement.upgradeId) || !Number.isSafeInteger(requirement.level) || requirement.level < 1) {
          throw new Error(`Upgrade ${definition.id} has an invalid requirement`)
        }
      }
    }
  }
}