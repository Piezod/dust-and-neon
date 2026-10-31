import type { LootTableDefinition, LootTableEntryDefinition } from './Loot.types'

const WEIGHT_TOLERANCE = 1e-8

export class LootTable {
  readonly id: string
  readonly mode: LootTableDefinition['mode']
  readonly entries: readonly LootTableEntryDefinition[]

  constructor(definition: LootTableDefinition) {
    if (!definition.id.trim()) throw new Error('Loot table id must not be empty')
    const ids = new Set<string>()
    for (const entry of definition.entries) {
      if (!entry.id.trim()) throw new Error('Loot entry id must not be empty')
      if (ids.has(entry.id)) throw new Error(`Duplicate loot entry id: ${entry.id}`)
      ids.add(entry.id)
      if (!Number.isFinite(entry.probability) || entry.probability < 0 || entry.probability > 1) {
        throw new RangeError(`Loot probability for ${entry.id} must be between 0 and 1`)
      }
      if (!Number.isSafeInteger(entry.minQuantity) || !Number.isSafeInteger(entry.maxQuantity)) {
        throw new RangeError(`Loot quantities for ${entry.id} must be safe integers`)
      }
      if (entry.minQuantity < 0 || entry.maxQuantity < entry.minQuantity) {
        throw new RangeError(`Loot quantity range for ${entry.id} is invalid`)
      }
      if (entry.type === 'none' && (entry.minQuantity !== 0 || entry.maxQuantity !== 0)) {
        throw new RangeError(`The none result for ${entry.id} must have quantity zero`)
      }
      if (entry.type !== 'none' && entry.minQuantity < 1) {
        throw new RangeError(`Reward quantity for ${entry.id} must be at least one`)
      }
    }
    if (definition.mode === 'weighted-exclusive' && definition.entries.length > 0) {
      const total = definition.entries.reduce((sum, entry) => sum + entry.probability, 0)
      if (Math.abs(total - 1) > WEIGHT_TOLERANCE) throw new RangeError(`Exclusive loot probabilities must sum to 1 (received ${total})`)
    }
    this.id = definition.id
    this.mode = definition.mode
    this.entries = Object.freeze(definition.entries.map((entry) => Object.freeze({ ...entry })))
    Object.freeze(this)
  }
}