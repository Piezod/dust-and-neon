export type DamageType = 'physical' | 'plasma'

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
}

export interface CombatBounds {
  readonly x: number
  readonly z: number
  readonly radius: number
}