import type { DamageType, ProjectileDefinition } from '../combat/Combat.types'

export type EnemyBehaviorId = 'chase' | 'keep-distance'
export type EnemyState = 'idle' | 'pursuing' | 'attacking' | 'dead'
export type EnemyAttackType = 'melee' | 'projectile' | 'area' | 'special'

export type EnemyBehaviorDefinition =
  | { readonly type: 'chase'; readonly stopDistance: number }
  | { readonly type: 'keep-distance'; readonly preferredDistance: number; readonly tolerance: number }

export interface EnemyAttackDefinition {
  readonly id: string
  readonly type: EnemyAttackType
  readonly minRange: number
  readonly maxRange: number
  readonly cooldownSeconds: number
  readonly priority: number
  readonly damage: number
  readonly damageType: DamageType
  readonly projectile?: ProjectileDefinition
}

export interface EnemyVisualDefinition {
  readonly bodyColor: string
  readonly accentColor: string
  readonly eyeColor: string
  readonly bodyHeight: number
}

export interface EnemyDefinition {
  readonly id: string
  readonly name: string
  readonly maxHealth: number
  readonly moveSpeed: number
  readonly collisionRadius: number
  readonly detectionRange: number
  readonly behavior: EnemyBehaviorDefinition
  readonly attacks: readonly EnemyAttackDefinition[]
  readonly visual: EnemyVisualDefinition
  readonly lootTableId?: string
}

export interface EnemyDeathEvent {
  readonly enemyId: string
  readonly definitionId: string
  readonly position: readonly [number, number, number]
  readonly lootTableId?: string
}