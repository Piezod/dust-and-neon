export type LootRewardType = 'health' | 'energy' | 'gold' | 'ammo' | 'weapon' | 'special' | 'material'
export type LootTableMode = 'weighted-exclusive' | 'independent-rolls'

export interface LootTableEntryDefinition {
  readonly id: string
  readonly type: LootRewardType | 'none'
  readonly probability: number
  readonly minQuantity: number
  readonly maxQuantity: number
}

interface LootTableBase {
  readonly id: string
  readonly entries: readonly LootTableEntryDefinition[]
}

export interface WeightedExclusiveLootTableDefinition extends LootTableBase {
  readonly mode: 'weighted-exclusive'
}

export interface IndependentLootTableDefinition extends LootTableBase {
  readonly mode: 'independent-rolls'
}

export type LootTableDefinition = WeightedExclusiveLootTableDefinition | IndependentLootTableDefinition

export interface LootReward {
  readonly type: LootRewardType
  readonly quantity: number
}

export interface LootRollResult {
  readonly tableId: string
  readonly rewards: readonly LootReward[]
}

export type RandomSource = () => number