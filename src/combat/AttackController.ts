import * as THREE from 'three'
import type { AttackDefinition, CombatSource } from './Combat.types'

export interface AttackShot {
  readonly offsetSeconds: number
  readonly position: THREE.Vector3
  readonly direction: THREE.Vector3
  readonly definition: AttackDefinition
}

export interface AttackStatModifier {
  readonly id: string
  readonly stat: 'damage' | 'shotsPerSecond'
  readonly flat?: number
  readonly percentage?: number
}

export interface EffectiveAttackStats {
  readonly damage: number
  readonly shotsPerSecond: number
}

export class AttackController {
  private timeUntilNextShot = 0
  private totalShots = 0
  private readonly direction = new THREE.Vector3()
  private readonly modifiers = new Map<string, Readonly<AttackStatModifier>>()
  readonly definition: AttackDefinition
  readonly source: CombatSource

  constructor(definition: AttackDefinition, source: CombatSource) {
    this.definition = definition
    this.source = source
    if (!definition.id || !definition.name) throw new Error('Attack identity is required')
    for (const [label, value] of [
      ['damage', definition.damage],
      ['shotsPerSecond', definition.shotsPerSecond],
      ['projectileSpeed', definition.projectileSpeed],
      ['maxRange', definition.maxRange],
      ['projectileRadius', definition.projectileRadius],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Attack ${label} must be positive and finite`)
    }
    if (!source.id || !source.faction) throw new Error('Attack source identity and faction are required')
  }

  get shotsFired(): number {
    return this.totalShots
  }

  cancel(): void {
    this.timeUntilNextShot = 0
  }

  getEffectiveStats(): EffectiveAttackStats {
    const resolve = (stat: AttackStatModifier['stat'], base: number): number => {
      let flat = 0
      let percentage = 0
      const modifiers = Array.from(this.modifiers.values()).sort((first, second) =>
        first.id < second.id ? -1 : first.id > second.id ? 1 : 0,
      )
      for (const modifier of modifiers) {
        if (modifier.stat !== stat) continue
        flat += modifier.flat ?? 0
        percentage += modifier.percentage ?? 0
      }
      return Math.max(Number.EPSILON, (base + flat) * (1 + percentage))
    }
    return {
      damage: resolve('damage', this.definition.damage),
      shotsPerSecond: resolve('shotsPerSecond', this.definition.shotsPerSecond),
    }
  }

  addModifier(modifier: AttackStatModifier): void {
    if (!modifier.id.trim()) throw new Error('Attack modifier id must not be empty')
    if (this.modifiers.has(modifier.id)) throw new Error(`Duplicate attack modifier id: ${modifier.id}`)
    if (!Number.isFinite(modifier.flat ?? 0) || !Number.isFinite(modifier.percentage ?? 0)) {
      throw new RangeError('Attack modifier values must be finite')
    }
    const candidate = Object.freeze({ ...modifier })
    this.modifiers.set(candidate.id, candidate)
    const stats = this.getEffectiveStats()
    if (!Number.isFinite(stats.damage) || !Number.isFinite(stats.shotsPerSecond)) {
      this.modifiers.delete(candidate.id)
      throw new RangeError('Attack modifier produced invalid effective stats')
    }
  }

  removeModifier(id: string): boolean {
    return this.modifiers.delete(id)
  }

  advance(deltaTime: number, firing: boolean, origin: THREE.Vector3, aimPoint: THREE.Vector3): readonly AttackShot[] {
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    this.direction.set(aimPoint.x - origin.x, 0, aimPoint.z - origin.z)
    if (this.direction.lengthSq() < 1e-8) {
      this.timeUntilNextShot = Math.max(0, this.timeUntilNextShot - elapsed)
      return []
    }
    this.direction.normalize()
    const effectiveStats = this.getEffectiveStats()
    const interval = 1 / effectiveStats.shotsPerSecond
    const timeTolerance = Number.EPSILON * Math.max(1, elapsed, this.timeUntilNextShot) * 8

    if (!firing) {
      this.timeUntilNextShot = Math.max(0, this.timeUntilNextShot - elapsed)
      return []
    }

    let remaining = elapsed
    let offset = 0
    if (this.timeUntilNextShot > 0) {
      if (remaining + timeTolerance < this.timeUntilNextShot) {
        this.timeUntilNextShot -= remaining
        return []
      }
      offset = this.timeUntilNextShot
      remaining = Math.max(0, remaining - this.timeUntilNextShot)
      this.timeUntilNextShot = 0
    }

    const shots: AttackShot[] = []
    do {
      const definition = effectiveStats.damage === this.definition.damage
        ? this.definition
        : { ...this.definition, damage: effectiveStats.damage }
      shots.push({ offsetSeconds: offset, position: origin.clone(), direction: this.direction.clone(), definition })
      this.totalShots++
      offset += interval
    } while (offset <= elapsed + timeTolerance)

    this.timeUntilNextShot = Math.max(0, offset - elapsed)
    return shots
  }
}