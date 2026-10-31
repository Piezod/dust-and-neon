import * as THREE from 'three'
import type { CombatSystem } from '../combat/CombatSystem'
import type { CombatBounds, CombatSource, DamageContext } from '../combat/Combat.types'
import type { Damageable } from '../combat/Damageable'
import type { EnemyBehavior } from './EnemyBehavior'
import { EnemyAttackController } from './EnemyAttackController'
import { EnemyVisual } from './EnemyVisual'
import type { EnemyDefinition, EnemyDeathEvent, EnemyState } from './Enemy.types'

export class Enemy implements Damageable {
  readonly root: THREE.Group
  readonly faction = 'enemies'
  readonly attackController: EnemyAttackController
  private readonly visual: EnemyVisual
  private readonly direction = new THREE.Vector3()
  private readonly candidate = new THREE.Vector3()
  private health: number
  private stateValue: EnemyState = 'idle'
  private deathNotified = false
  readonly combatId: string
  readonly definition: EnemyDefinition
  private readonly obstacles: readonly THREE.Box2[]
  private readonly onDeath: (enemy: Enemy, event: EnemyDeathEvent) => void

  constructor(
    combatId: string,
    definition: EnemyDefinition,
    position: THREE.Vector3,
    behavior: EnemyBehavior,
    combat: CombatSystem,
    obstacles: readonly THREE.Box2[],
    onDeath: (enemy: Enemy, event: EnemyDeathEvent) => void,
  ) {
    this.combatId = combatId
    this.definition = definition
    this.obstacles = obstacles
    this.onDeath = onDeath
    this.health = definition.maxHealth
    this.visual = new EnemyVisual(definition.visual)
    this.root = this.visual.root
    this.root.name = `Enemy:${definition.id}:${combatId}`
    this.root.position.copy(position)
    this.behavior = behavior
    const source: CombatSource = { id: combatId, faction: this.faction }
    this.attackController = new EnemyAttackController(definition.attacks, source, combat)
    this.visual.updateHealth(1)
  }

  private readonly behavior: EnemyBehavior

  get currentHealth(): number {
    return this.health
  }

  get state(): EnemyState {
    return this.stateValue
  }

  get isDead(): boolean {
    return this.stateValue === 'dead'
  }

  getCombatBounds(): CombatBounds {
    return { x: this.root.position.x, z: this.root.position.z, radius: this.definition.collisionRadius }
  }

  applyDamage(context: DamageContext): void {
    if (this.isDead || context.sourceId === this.combatId || context.sourceFaction === this.faction) return
    if (!Number.isFinite(context.amount) || context.amount <= 0) return
    this.health = Math.max(0, this.health - context.amount)
    this.visual.updateHealth(this.health / this.definition.maxHealth)
    if (this.health === 0) this.die()
  }

  update(deltaTime: number, player: Damageable, otherEnemies: readonly Enemy[]): void {
    if (this.isDead) return
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    const playerBounds = player.getCombatBounds()
    const detected = this.distanceTo(playerBounds.x, playerBounds.z) <= this.definition.detectionRange
    this.stateValue = detected ? 'pursuing' : 'idle'
    if (detected && elapsed > 0) {
      this.behavior.getDirection(this.root.position, new THREE.Vector3(playerBounds.x, this.root.position.y, playerBounds.z), this.direction)
      this.move(this.direction, elapsed, playerBounds, otherEnemies)
    }
    const distance = this.distanceTo(playerBounds.x, playerBounds.z)
    const targetPosition = new THREE.Vector3(playerBounds.x, 0, playerBounds.z)
    const origin = new THREE.Vector3(this.root.position.x, this.definition.visual.bodyHeight * 0.65, this.root.position.z)
    const attackId = this.attackController.update(elapsed, detected, distance, origin, targetPosition, player)
    if (attackId) this.stateValue = 'attacking'
    if (this.direction.lengthSq() > 0) this.root.rotation.y = Math.atan2(this.direction.x, this.direction.z)
  }

  dispose(): void {
    this.visual.dispose()
  }

  private move(direction: THREE.Vector3, deltaTime: number, player: CombatBounds, otherEnemies: readonly Enemy[]): void {
    const distance = this.definition.moveSpeed * deltaTime
    const stepLength = Math.max(this.definition.collisionRadius * 0.4, 0.12)
    const steps = Math.max(1, Math.ceil(distance / stepLength))
    const stepX = direction.x * distance / steps
    const stepZ = direction.z * distance / steps
    for (let step = 0; step < steps; step++) {
      let moved = false
      if (this.canOccupy(this.root.position.x + stepX, this.root.position.z, player, otherEnemies)) {
        this.root.position.x += stepX
        moved = true
      }
      if (this.canOccupy(this.root.position.x, this.root.position.z + stepZ, player, otherEnemies)) {
        this.root.position.z += stepZ
        moved = true
      }
      if (!moved && direction.lengthSq() > 0) this.tryLocalDetour(direction, player, otherEnemies)
    }
  }

  private tryLocalDetour(direction: THREE.Vector3, player: CombatBounds, otherEnemies: readonly Enemy[]): void {
    let bestDistance = this.distanceTo(player.x, player.z)
    let found = false
    for (const angle of [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
      this.candidate.set(direction.x, 0, direction.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).multiplyScalar(this.definition.collisionRadius * 0.45)
      const x = this.root.position.x + this.candidate.x
      const z = this.root.position.z + this.candidate.z
      const distance = Math.hypot(player.x - x, player.z - z)
      if (distance < bestDistance && this.canOccupy(x, z, player, otherEnemies)) {
        bestDistance = distance
        this.candidate.set(x - this.root.position.x, 0, z - this.root.position.z)
        found = true
      }
    }
    if (found) this.root.position.add(this.candidate)
  }

  private canOccupy(x: number, z: number, player: CombatBounds, otherEnemies: readonly Enemy[]): boolean {
    const radius = this.definition.collisionRadius
    for (const obstacle of this.obstacles) {
      const closestX = THREE.MathUtils.clamp(x, obstacle.min.x, obstacle.max.x)
      const closestZ = THREE.MathUtils.clamp(z, obstacle.min.y, obstacle.max.y)
      if ((x - closestX) ** 2 + (z - closestZ) ** 2 < radius * radius) return false
    }
    const playerDistance = Math.hypot(x - player.x, z - player.z)
    if (playerDistance < radius + player.radius) return false
    for (const other of otherEnemies) {
      if (other === this || other.isDead) continue
      const bounds = other.getCombatBounds()
      if (Math.hypot(x - bounds.x, z - bounds.z) < radius + bounds.radius) return false
    }
    return true
  }

  private distanceTo(x: number, z: number): number {
    return Math.hypot(this.root.position.x - x, this.root.position.z - z)
  }

  private die(): void {
    if (this.deathNotified) return
    this.deathNotified = true
    this.stateValue = 'dead'
    const event: EnemyDeathEvent = {
      enemyId: this.combatId,
      definitionId: this.definition.id,
      position: [this.root.position.x, this.root.position.y, this.root.position.z],
      lootTableId: this.definition.lootTableId,
    }
    this.onDeath(this, event)
  }
}