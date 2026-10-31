import * as THREE from 'three'
import type { EnemyBehavior } from './EnemyBehavior'

export class ChaseBehavior implements EnemyBehavior {
  private readonly stopDistance: number

  constructor(stopDistance: number) {
    this.stopDistance = stopDistance
  }

  getDirection(position: THREE.Vector3, target: THREE.Vector3, output: THREE.Vector3): THREE.Vector3 {
    output.set(target.x - position.x, 0, target.z - position.z)
    const distance = output.length()
    return distance <= this.stopDistance || distance === 0 ? output.set(0, 0, 0) : output.divideScalar(distance)
  }
}