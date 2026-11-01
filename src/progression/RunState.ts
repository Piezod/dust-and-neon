import type { CharacterStats } from '../core/CharacterStats'
import type { CombatSystem } from '../combat/CombatSystem'
import type { PerkDefinition, UpgradeDefinition } from './Progression.types'
import { PerkManager } from './PerkManager'
import { ProgressionEffectApplier } from './ProgressionEffectApplier'
import { UpgradeManager } from './UpgradeManager'
import { Wallet } from '../loot/Wallet'
import type { GameEventBus } from '../events/GameEventBus'

export class RunState {
  readonly wallet = new Wallet()
  readonly upgrades: UpgradeManager
  readonly perks: PerkManager
  private readonly effects: ProgressionEffectApplier
  private resetDone = false

  constructor(stats: CharacterStats, combat: CombatSystem, upgrades: readonly UpgradeDefinition[], perks: readonly PerkDefinition[], perkChoicesPerIntermission = 1, events?: GameEventBus) {
    this.effects = new ProgressionEffectApplier(stats, combat)
    this.upgrades = new UpgradeManager(this.wallet, this.effects, upgrades, events)
    this.perks = new PerkManager(this.effects, perks, perkChoicesPerIntermission, events)
  }

  beginIntermission(waveNumber: number): void {
    const intermissionId = `wave:${waveNumber}`
    this.upgrades.setPurchasesAllowed(true)
    this.perks.beginIntermission(intermissionId)
  }

  endIntermission(): void {
    this.upgrades.setPurchasesAllowed(false)
    this.perks.endIntermission()
  }

  reset(): void {
    if (this.resetDone) return
    this.resetDone = true
    this.upgrades.reset()
    this.perks.reset()
    this.effects.reset()
    this.wallet.reset()
  }
}