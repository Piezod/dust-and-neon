import type { LootReward, LootRollResult, RandomSource } from './Loot.types'
import { LootTable } from './LootTable'

export class LootRoller {
  private readonly random: RandomSource

  constructor(random: RandomSource = Math.random) {
    this.random = random
  }

  roll(table: LootTable): LootRollResult {
    if (table.entries.length === 0) return { tableId: table.id, rewards: [] }
    if (table.mode === 'weighted-exclusive') return this.rollExclusive(table)
    return this.rollIndependent(table)
  }

  private rollExclusive(table: LootTable): LootRollResult {
    const roll = this.nextValue()
    let cumulative = 0
    let selected = table.entries[table.entries.length - 1]
    for (const entry of table.entries) {
      cumulative += entry.probability
      if (roll < cumulative) {
        selected = entry
        break
      }
    }
    return { tableId: table.id, rewards: Object.freeze(this.createReward(selected)) }
  }

  private rollIndependent(table: LootTable): LootRollResult {
    const rewards: LootReward[] = []
    for (const entry of table.entries) {
      if (this.nextValue() < entry.probability) rewards.push(...this.createReward(entry))
    }
    return { tableId: table.id, rewards: Object.freeze(rewards) }
  }

  private createReward(entry: LootTable['entries'][number]): LootReward[] {
    if (entry.type === 'none') return []
    const range = entry.maxQuantity - entry.minQuantity + 1
    const quantity = range === 1 ? entry.minQuantity : entry.minQuantity + Math.floor(this.nextValue() * range)
    return [{ type: entry.type, quantity }]
  }

  private nextValue(): number {
    const value = this.random()
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random source must return a value in [0, 1)')
    return value
  }
}