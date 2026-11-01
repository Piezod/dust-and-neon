export type DamageType = 'physical' | 'fire' | 'electric' | 'plasma' | 'cryo'

export interface ProjectileDefinition {
  readonly id: string
  readonly damage: number
  readonly projectileSpeed: number
  readonly maxRange: number
  readonly projectileRadius: number
  readonly damageType: DamageType
  readonly projectileColor?: string
  readonly projectileEmissive?: string
  readonly projectileEmissiveIntensity?: number
  readonly statusEffects?: readonly DamageStatusApplication[]
  readonly onImpact?: ProjectileImpactEffect
}

export type DamageStatusApplication =
  | { readonly type: 'burn'; readonly durationSeconds: number; readonly damagePerSecond: number; readonly tickIntervalSeconds?: number }
  | { readonly type: 'slow'; readonly durationSeconds: number; readonly movementMultiplier: number }
  | { readonly type: 'shock'; readonly staggerSeconds: number }

export interface ProjectileImpactEffect {
  readonly splash?: { readonly radius: number; readonly damageMultiplier: number; readonly maxTargets: number }
  readonly chain?: { readonly range: number; readonly damageMultiplier: number; readonly maxTargets: number }
}

export interface AttackDefinition extends ProjectileDefinition {
  readonly id: string
  readonly name: string
  readonly shotsPerSecond: number
}

export interface CombatSource {
  readonly id: string
  readonly faction: string
}

export interface DamageContext {
  readonly sourceId: string
  readonly sourceFaction: string
  readonly amount: number
  readonly type: DamageType
  readonly sourcePosition?: readonly [number, number, number]
  readonly effects?: readonly DamageStatusApplication[]
}

export interface CombatBounds {
  readonly x: number
  readonly z: number
  readonly radius: number
}