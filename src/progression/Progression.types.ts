import type { StatKey } from '../core/CharacterStats.types'

export type WeaponStatKey = 'damage' | 'shotsPerSecond'

export type ProgressionEffect =
  | { readonly target: 'character'; readonly stat: StatKey; readonly flat?: number; readonly percentage?: number }
  | { readonly target: 'weapon'; readonly stat: WeaponStatKey; readonly flat?: number; readonly percentage?: number }

export interface UpgradeRequirement {
  readonly upgradeId: string
  readonly level: number
}

export interface UpgradeDefinition {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly cost: number
  readonly maxLevel: number
  readonly requirements?: readonly UpgradeRequirement[]
  readonly effects: readonly ProgressionEffect[]
}

export interface PerkDefinition {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly stackingRule: 'unique' | 'stackable'
  readonly maxStacks: number
  readonly effects: readonly ProgressionEffect[]
  readonly sounds?: { readonly select?: string }
}

export interface UpgradeState {
  readonly id: string
  readonly level: number
  readonly maxLevel: number
  readonly cost: number
  readonly canPurchase: boolean
}

export interface PerkState {
  readonly id: string
  readonly stacks: number
  readonly maxStacks: number
  readonly selectedThisIntermission: boolean
  readonly canSelect: boolean
}

export type UpgradePurchaseResult =
  | { readonly purchased: true; readonly upgradeId: string; readonly level: number }
  | { readonly purchased: false; readonly upgradeId: string; readonly reason: 'unknown-upgrade' | 'max-level' | 'requirements' | 'insufficient-gold' | 'wrong-state' }

export type PerkSelectionResult =
  | { readonly selected: true; readonly perkId: string; readonly stacks: number }
  | { readonly selected: false; readonly perkId: string; readonly reason: 'unknown-perk' | 'intermission-closed' | 'already-selected' | 'max-stacks' | 'choice-limit' }