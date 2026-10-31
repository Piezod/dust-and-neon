import * as THREE from 'three'
import type { EnemyBehavior } from './EnemyBehavior'

export class KeepDistanceBehavior implements EnemyBehavior {
  private readonly preferredDistance: number
  private readonly tolerance: number

  constructor(preferredDistance: number, tolerance: number) {
    this.preferredDistance = preferredDistance
    this.tolerance = tolerance
  }

  getDirection(position: THREE.Vector3, target: THREE.Vector3, output: THREE.Vector3): THREE.Vector3 {
    output.set(target.x - position.x, 0, target.z - position.z)
    const distance = output.length()
    if (distance === 0 || Math.abs(distance - this.preferredDistance) <= this.tolerance) return output.set(0, 0, 0)
    output.divideScalar(distance)
    if (distance < this.preferredDistance) output.negate()
    return output
  }
}