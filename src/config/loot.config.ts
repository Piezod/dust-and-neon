import type { LootTableDefinition } from '../loot/Loot.types'

const BASIC_ENEMY_LOOT: LootTableDefinition = Object.freeze({
  id: 'enemy-basic',
  mode: 'weighted-exclusive',
  entries: Object.freeze([
    Object.freeze({ id: 'health', type: 'health', probability: 0.15, minQuantity: 20, maxQuantity: 20 }),
    Object.freeze({ id: 'energy', type: 'energy', probability: 0.2, minQuantity: 25, maxQuantity: 25 }),
    Object.freeze({ id: 'gold', type: 'gold', probability: 0.4, minQuantity: 5, maxQuantity: 15 }),
    Object.freeze({ id: 'none', type: 'none', probability: 0.25, minQuantity: 0, maxQuantity: 0 }),
  ]),
})

const MECHANICAL_LOOT: LootTableDefinition = Object.freeze({
  id: 'enemy-mechanical',
  mode: 'independent-rolls',
  entries: Object.freeze([
    Object.freeze({ id: 'gold', type: 'gold', probability: 1, minQuantity: 5, maxQuantity: 15 }),
    Object.freeze({ id: 'health', type: 'health', probability: 0.25, minQuantity: 20, maxQuantity: 20 }),
    Object.freeze({ id: 'energy', type: 'energy', probability: 0.35, minQuantity: 25, maxQuantity: 25 }),
  ]),
})

export const LOOT_TABLES: readonly LootTableDefinition[] = Object.freeze([BASIC_ENEMY_LOOT, MECHANICAL_LOOT])