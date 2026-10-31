import * as THREE from 'three'
import type { EnemyBehaviorDefinition } from './Enemy.types'

export interface EnemyBehavior {
  getDirection(position: THREE.Vector3, target: THREE.Vector3, output: THREE.Vector3): THREE.Vector3
}

export type EnemyBehaviorFactory = (definition: EnemyBehaviorDefinition) => EnemyBehavior