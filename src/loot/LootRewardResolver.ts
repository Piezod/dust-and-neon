import type { CharacterStats } from '../core/CharacterStats'
import type { LootReward } from './Loot.types'
import type { Wallet } from './Wallet'

export class LootRewardResolver {
  private readonly stats: CharacterStats
  private readonly wallet: Wallet
  private readonly isPlayerAlive: () => boolean

  constructor(stats: CharacterStats, wallet: Wallet, isPlayerAlive: () => boolean) {
    this.stats = stats
    this.wallet = wallet
    this.isPlayerAlive = isPlayerAlive
  }

  apply(reward: LootReward): boolean {
    if (!this.isPlayerAlive() || !Number.isSafeInteger(reward.quantity) || reward.quantity <= 0) return false
    if (reward.type === 'health') this.stats.heal(reward.quantity)
    else if (reward.type === 'energy') this.stats.restoreEnergy(reward.quantity)
    else if (reward.type === 'gold') this.wallet.add(reward.quantity)
    else return false
    return true
  }
}