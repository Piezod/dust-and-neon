import * as THREE from 'three'
import { PlayerVisual } from './PlayerVisual'
import { CharacterStats } from '../core/CharacterStats'
import { PLAYER_BASE_STATS } from '../config/player.config'

export class Player {
  readonly root = new THREE.Group()
  readonly position = this.root.position
  readonly velocity = new THREE.Vector3()
  readonly stats = new CharacterStats(PLAYER_BASE_STATS)
  readonly radius = 0.43
  private readonly visual = new PlayerVisual()
  private readonly previousPosition = new THREE.Vector3()

  constructor() {
    this.root.name = 'Player'
    this.position.set(1, -0.03, 3)
    this.root.rotation.y = Math.PI / 4
    this.root.add(this.visual.root)
  }

  get orientation(): number {
    return this.root.rotation.y
  }

  get speed(): number {
    return this.stats.getStat('moveSpeed')
  }

  update(direction: THREE.Vector3, deltaTime: number, obstacles: readonly THREE.Box2[]): void {
    this.previousPosition.copy(this.position)
    const speed = this.speed
    const distance = speed * Math.max(deltaTime, 0)
    const steps = Math.max(1, Math.ceil(distance / (this.radius * 0.5)))
    const stepX = direction.x * distance / steps
    const stepZ = direction.z * distance / steps
    for (let step = 0; step < steps; step++) {
      if (this.canOccupy(this.position.x + stepX, this.position.z, obstacles)) this.position.x += stepX
      if (this.canOccupy(this.position.x, this.position.z + stepZ, obstacles)) this.position.z += stepZ
    }
    this.velocity.subVectors(this.position, this.previousPosition)
    if (deltaTime > 0) this.velocity.divideScalar(deltaTime)
    this.visual.update(Math.max(deltaTime, 0), speed > 0 ? this.velocity.length() / speed : 0)
  }

  facePoint(point: THREE.Vector3): void {
    const directionX = point.x - this.position.x
    const directionZ = point.z - this.position.z
    if (directionX * directionX + directionZ * directionZ > 0.0001) {
      this.root.rotation.y = Math.atan2(directionX, directionZ)
    }
  }

  private canOccupy(positionX: number, positionZ: number, obstacles: readonly THREE.Box2[]): boolean {
    return obstacles.every((obstacle) => {
      const closestX = THREE.MathUtils.clamp(positionX, obstacle.min.x, obstacle.max.x)
      const closestZ = THREE.MathUtils.clamp(positionZ, obstacle.min.y, obstacle.max.y)
      const distanceX = positionX - closestX
      const distanceZ = positionZ - closestZ
      return distanceX * distanceX + distanceZ * distanceZ >= this.radius * this.radius
    })
  }

  dispose(): void {
    this.visual.dispose()
    this.root.removeFromParent()
  }
}