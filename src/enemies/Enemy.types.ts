import type { DamageType, ProjectileDefinition } from '../combat/Combat.types'

export type EnemyBehaviorId = 'chase' | 'keep-distance'
export type EnemyState = 'idle' | 'pursuing' | 'attacking' | 'dead'
export type EnemyAttackType = 'melee' | 'projectile' | 'area' | 'special'
export type EnemyAttackPhase = 'windup' | 'active' | 'recovery' | 'cooldown'

export type EnemyTelegraphShape = 'ring' | 'line' | 'fan' | 'radial' | 'markers' | 'burrow'

export type EnemyAttackPattern =
  | { readonly kind: 'direct' }
  | { readonly kind: 'fan'; readonly projectileCount: number; readonly spreadRadians: number }
  | { readonly kind: 'radial'; readonly projectileCount: number }
  | { readonly kind: 'cone'; readonly range: number; readonly angleRadians: number; readonly tickIntervalSeconds: number }
  | { readonly kind: 'line'; readonly range: number; readonly width: number }
  | { readonly kind: 'charge'; readonly speed: number; readonly maxDistance: number; readonly collisionRadius: number }
  | { readonly kind: 'lobbed-zone'; readonly radius: number; readonly delaySeconds: number; readonly activeSeconds: number; readonly tickIntervalSeconds: number; readonly apexHeight: number }
  | { readonly kind: 'multi-zone'; readonly zoneCount: number; readonly radius: number; readonly spreadDistance: number; readonly delaySeconds: number; readonly activeSeconds: number; readonly tickIntervalSeconds: number }
  | { readonly kind: 'arc-nodes'; readonly nodeRange: number; readonly linkWidth: number; readonly activeSeconds: number; readonly tickIntervalSeconds: number }
  | { readonly kind: 'leap'; readonly maxDistance: number; readonly landingRadius: number }
  | { readonly kind: 'suicide'; readonly fuseSeconds: number; readonly radius: number; readonly fireZoneSeconds: number }
  | { readonly kind: 'burrow'; readonly travelDistance: number; readonly emergeRadius: number; readonly emergeDelaySeconds: number }
  | { readonly kind: 'projectile-explosion'; readonly radius: number; readonly damageMultiplier: number }

export interface EnemyTelegraphDefinition {
  readonly shape: EnemyTelegraphShape
  readonly color: string
  readonly radius?: number
}

export interface EnemyVisualPartDefinition {
  readonly shape: 'box' | 'sphere' | 'cone' | 'cylinder' | 'torus'
  readonly position: readonly [number, number, number]
  readonly size: readonly [number, number, number]
  readonly material: 'body' | 'accent' | 'eyes'
  readonly rotation?: readonly [number, number, number]
}

export interface ExperimentalEnemyProfile {
  readonly enabledInNormalRuns: false
  readonly role: string
  readonly description: string
  readonly weaknesses: readonly DamageType[]
  readonly rewardGold: readonly [number, number]
  readonly maxGeneratedEntities: number
  readonly testingNotes: string
  readonly attacks: readonly EnemyAttackDefinition[]
}

export interface EnemyFrontResistance {
  readonly halfAngleRadians: number
  readonly damageMultiplier: number
}

export interface EnemyAttackPhaseState {
  readonly attackId: string
  readonly phase: EnemyAttackPhase
  readonly progress: number
  readonly remainingSeconds: number
}

export type EnemyBehaviorDefinition =
  | { readonly type: 'chase'; readonly stopDistance: number }
  | { readonly type: 'keep-distance'; readonly preferredDistance: number; readonly tolerance: number }
  | { readonly type: 'strafe'; readonly preferredDistance: number; readonly tolerance: number; readonly orbitSpeed: number }
  | { readonly type: 'hold'; readonly preferredDistance: number }

export interface EnemyAttackDefinition {
  readonly id: string
  readonly type: EnemyAttackType
  readonly minRange: number
  readonly maxRange: number
  readonly cooldownSeconds: number
  readonly windupSeconds?: number
  readonly activeSeconds?: number
  readonly recoverySeconds?: number
  readonly burstCount?: number
  readonly burstIntervalSeconds?: number
  readonly priority: number
  readonly damage: number
  readonly damageType: DamageType
  readonly projectile?: ProjectileDefinition
  readonly pattern?: EnemyAttackPattern
  readonly telegraph?: EnemyTelegraphDefinition
  readonly statusEffects?: readonly import('../combat/Combat.types').DamageStatusApplication[]
}

export interface EnemyVisualDefinition {
  readonly bodyColor: string
  readonly accentColor: string
  readonly eyeColor: string
  readonly bodyHeight: number
  readonly parts?: readonly EnemyVisualPartDefinition[]
}

export interface EnemySoundDefinition {
  readonly spawn?: string
  readonly attack?: string
  readonly damaged?: string
  readonly death?: string
  readonly special?: string
}

export interface EnemyDefinition {
  readonly id: string
  readonly name: string
  readonly maxHealth: number
  readonly moveSpeed: number
  readonly collisionRadius: number
  readonly damageHitboxRadius?: number
  readonly detectionRange: number
  readonly behavior: EnemyBehaviorDefinition
  readonly attacks: readonly EnemyAttackDefinition[]
  readonly visual: EnemyVisualDefinition
  readonly sounds?: EnemySoundDefinition
  readonly lootTableId?: string
  readonly resistances?: Partial<Record<DamageType, number>>
  readonly frontResistance?: EnemyFrontResistance
  readonly experimental?: ExperimentalEnemyProfile
}

export interface EnemyDeathEvent {
  readonly enemyId: string
  readonly definitionId: string
  readonly position: readonly [number, number, number]
  readonly lootTableId?: string
}

export interface EnemySpawnDifficulty {
  readonly healthMultiplier: number
  readonly damageMultiplier: number
  readonly speedMultiplier: number
  readonly cooldownMultiplier: number
  readonly projectileSpeedMultiplier?: number
  readonly telegraphMultiplier?: number
}