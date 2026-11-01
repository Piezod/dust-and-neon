import type { DamageStatusApplication, DamageType, ProjectileDefinition } from '../combat/Combat.types'

export type BossAttackPattern = 'aimed' | 'burst' | 'fan' | 'radial' | 'melee' | 'charge' | 'zone' | 'laser' | 'summon' | 'arc-nodes' | 'sequence'
export type BossTelegraphType = 'none' | 'line' | 'fan' | 'ring' | 'zone' | 'nodes'
export type BossPartShape = 'box' | 'sphere' | 'cone' | 'cylinder' | 'torus'
export type BossState = 'intro' | 'combat' | 'transition' | 'defeated' | 'disposed'
export type BossAttackPhase = 'windup' | 'active' | 'recovery' | 'cooldown'
export type BossMovementStyle = 'approach' | 'orbit' | 'hold'

export interface BossVisualPart {
  readonly id: string
  readonly shape: BossPartShape
  readonly position: readonly [number, number, number]
  readonly size: readonly [number, number, number]
  readonly color: string
  readonly emissive?: string
  readonly emissiveIntensity?: number
  readonly rotation?: readonly [number, number, number]
}

export interface BossPhaseDefinition {
  readonly id: string
  readonly healthBelow: number
  readonly attackIds: readonly string[]
  readonly moveSpeedMultiplier: number
  readonly visualTint: string
  readonly enterSoundId?: string
}

export interface BossAttackDefinition {
  readonly id: string
  readonly pattern: BossAttackPattern
  readonly minRange: number
  readonly maxRange: number
  readonly priority: number
  readonly weight?: number
  readonly phases: readonly string[]
  readonly cooldownSeconds: number
  readonly windupSeconds: number
  readonly activeSeconds: number
  readonly recoverySeconds: number
  readonly damage: number
  readonly damageType: DamageType
  readonly projectile?: ProjectileDefinition
  readonly projectileCount?: number
  readonly burstCount?: number
  readonly burstIntervalSeconds?: number
  readonly spreadRadians?: number
  readonly radius?: number
  readonly nodeRange?: number
  readonly linkWidth?: number
  readonly nodeHealth?: number
  readonly tickIntervalSeconds?: number
  readonly statusEffects?: readonly DamageStatusApplication[]
  readonly chargeSpeed?: number
  readonly summonEnemyId?: string
  readonly summonCount?: number
  readonly telegraph: BossTelegraphType
  readonly soundId?: string
  readonly sequence?: readonly BossSequenceStep[]
}

export interface BossSequenceStep {
  readonly pattern: Exclude<BossAttackPattern, 'sequence' | 'summon' | 'arc-nodes'>
  readonly delaySeconds: number
  readonly projectileCount?: number
  readonly spreadRadians?: number
  readonly radius?: number
}

export interface BossRewards {
  readonly gold: number
  readonly healthRecovery: number
  readonly energyRecovery: number
}

export interface BossDefinition {
  readonly id: string
  readonly name: string
  readonly subtitle: string
  readonly maxHealth: number
  readonly collisionRadius: number
  readonly moveSpeed: number
  readonly preferredDistance: number
  readonly movement: BossMovementStyle
  readonly detectionRange: number
  readonly attacks: readonly BossAttackDefinition[]
  readonly phases: readonly BossPhaseDefinition[]
  readonly visualParts: readonly BossVisualPart[]
  readonly rewards: BossRewards
  readonly arenaRadius: number
  readonly arenaColor: string
  readonly maxSummons: number
}

export interface BossAttackRuntimeState {
  readonly attackId: string
  readonly phase: BossAttackPhase
  readonly progress: number
  readonly telegraph: BossTelegraphType
  readonly targetPosition: readonly [number, number, number]
}

export interface BossSnapshot {
  readonly id: string
  readonly name: string
  readonly phaseId: string
  readonly phaseIndex: number
  readonly phaseCount: number
  readonly currentHealth: number
  readonly maxHealth: number
  readonly healthRatio: number
  readonly state: BossState
  readonly attack: BossAttackRuntimeState | null
}
