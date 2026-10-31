import * as THREE from 'three'
import { PlayerVisual } from './PlayerVisual'
import { CharacterStats } from '../core/CharacterStats'
import { PLAYER_BASE_STATS } from '../config/player.config'
import { AbilityManager } from '../abilities/AbilityManager'
import { createPlayerAbilityFactories } from '../config/abilities.config'
import type { CombatBounds, DamageContext } from '../combat/Combat.types'
import type { Damageable } from '../combat/Damageable'

export class Player implements Damageable {
  readonly combatId = 'player'
  readonly faction = 'player'
  readonly root = new THREE.Group()
  readonly position = this.root.position
  readonly velocity = new THREE.Vector3()
  readonly stats = new CharacterStats(PLAYER_BASE_STATS)
  readonly abilities = new AbilityManager(createPlayerAbilityFactories(this.stats))
  readonly radius = 0.43
  private readonly visual = new PlayerVisual()
  private readonly previousPosition = new THREE.Vector3()
  private readonly lastMovementDirection = new THREE.Vector2(Math.sin(Math.PI / 4), Math.cos(Math.PI / 4))
  private readonly dashDirection = new THREE.Vector3()

  constructor() {
    this.root.name = 'Player'
    this.position.set(1, -0.03, 3)
    this.root.rotation.y = Math.PI / 4
    this.root.add(this.visual.root)
  }

  get orientation(): number {
    return this.root.rotation.y
  }

  get isAlive(): boolean {
    return this.stats.isAlive
  }

  get speed(): number {
    return this.stats.getStat('moveSpeed')
  }

  getMuzzlePosition(target: THREE.Vector3): THREE.Vector3 {
    return this.visual.getMuzzleWorldPosition(target)
  }

  getCombatBounds(): CombatBounds {
    return { x: this.position.x, z: this.position.z, radius: this.radius }
  }

  applyDamage(context: DamageContext): void {
    if (context.sourceId === this.combatId || context.sourceFaction === this.faction) return
    this.stats.takeDamage(context.amount)
  }

  resolveMovementDirection(direction: THREE.Vector3): { readonly x: number; readonly z: number } {
    if (direction.lengthSq() > 0) return { x: direction.x, z: direction.z }
    return { x: this.lastMovementDirection.x, z: this.lastMovementDirection.y }
  }

  update(direction: THREE.Vector3, deltaTime: number, obstacles: readonly THREE.Box2[]): void {
    this.previousPosition.copy(this.position)
    const elapsed = Math.max(0, deltaTime)
    if (!this.isAlive) {
      this.velocity.set(0, 0, 0)
      this.visual.update(elapsed, 0)
      return
    }
    if (direction.lengthSq() > 0) this.lastMovementDirection.set(direction.x, direction.z).normalize()
    let remainingTime = elapsed
    const abilityMovement = this.abilities.consumeMovement(elapsed)
    if (abilityMovement) {
      this.dashDirection.set(abilityMovement.direction.x, 0, abilityMovement.direction.z)
      this.move(this.dashDirection, abilityMovement.speed, abilityMovement.duration, obstacles)
      remainingTime -= abilityMovement.duration
    }
    if (remainingTime > 0) this.move(direction, this.speed, remainingTime, obstacles)
    this.velocity.subVectors(this.position, this.previousPosition)
    if (deltaTime > 0) this.velocity.divideScalar(deltaTime)
    this.visual.update(elapsed, this.speed > 0 ? this.velocity.length() / this.speed : 0)
  }

  private move(direction: THREE.Vector3, speed: number, deltaTime: number, obstacles: readonly THREE.Box2[]): void {
    const distance = speed * Math.max(deltaTime, 0)
    const steps = Math.max(1, Math.ceil(distance / (this.radius * 0.5)))
    const stepX = direction.x * distance / steps
    const stepZ = direction.z * distance / steps
    for (let step = 0; step < steps; step++) {
      if (this.canOccupy(this.position.x + stepX, this.position.z, obstacles)) this.position.x += stepX
      if (this.canOccupy(this.position.x, this.position.z + stepZ, obstacles)) this.position.z += stepZ
    }
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