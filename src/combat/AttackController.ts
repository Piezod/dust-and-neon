import * as THREE from 'three'
import type { AttackDefinition, CombatSource } from './Combat.types'

export interface AttackShot {
  readonly offsetSeconds: number
  readonly position: THREE.Vector3
  readonly direction: THREE.Vector3
}

export class AttackController {
  private readonly interval: number
  private timeUntilNextShot = 0
  private totalShots = 0
  private readonly direction = new THREE.Vector3()
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
    this.interval = 1 / definition.shotsPerSecond
  }

  get shotsFired(): number {
    return this.totalShots
  }

  cancel(): void {
    this.timeUntilNextShot = 0
  }

  advance(deltaTime: number, firing: boolean, origin: THREE.Vector3, aimPoint: THREE.Vector3): readonly AttackShot[] {
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    this.direction.set(aimPoint.x - origin.x, 0, aimPoint.z - origin.z)
    if (this.direction.lengthSq() < 1e-8) {
      this.timeUntilNextShot = Math.max(0, this.timeUntilNextShot - elapsed)
      return []
    }
    this.direction.normalize()
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
      shots.push({ offsetSeconds: offset, position: origin.clone(), direction: this.direction.clone() })
      this.totalShots++
      offset += this.interval
    } while (offset <= elapsed + timeTolerance)

    this.timeUntilNextShot = Math.max(0, offset - elapsed)
    return shots
  }
}