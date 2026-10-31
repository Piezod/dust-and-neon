import * as THREE from 'three'
import type { CombatSystem } from '../combat/CombatSystem'
import type { Damageable } from '../combat/Damageable'
import { ChaseBehavior } from './ChaseBehavior'
import type { EnemyBehaviorFactory } from './EnemyBehavior'
import { Enemy } from './Enemy'
import { KeepDistanceBehavior } from './KeepDistanceBehavior'
import type { EnemyDeathEvent, EnemyDefinition, EnemyBehaviorDefinition } from './Enemy.types'

const BEHAVIOR_FACTORIES: Readonly<Record<EnemyBehaviorDefinition['type'], EnemyBehaviorFactory>> = {
  chase: (definition) => {
    if (definition.type !== 'chase') throw new TypeError('Chase behavior configuration mismatch')
    return new ChaseBehavior(definition.stopDistance)
  },
  'keep-distance': (definition) => {
    if (definition.type !== 'keep-distance') throw new TypeError('Keep-distance behavior configuration mismatch')
    return new KeepDistanceBehavior(definition.preferredDistance, definition.tolerance)
  },
}

export class EnemyManager {
  private readonly enemies = new Map<string, Enemy>()
  private readonly counters = new Map<string, number>()
  private readonly deathListeners = new Set<(event: EnemyDeathEvent) => void>()
  private readonly definitions: ReadonlyMap<string, EnemyDefinition>
  private readonly spawnOffsets = this.createSpawnOffsets()
  private readonly parent: THREE.Object3D
  private readonly obstacles: readonly THREE.Box2[]
  private readonly combat: CombatSystem
  private readonly player: Damageable

  constructor(
    parent: THREE.Object3D,
    obstacles: readonly THREE.Box2[],
    combat: CombatSystem,
    player: Damageable,
    definitions: readonly EnemyDefinition[],
  ) {
    this.parent = parent
    this.obstacles = obstacles
    this.combat = combat
    this.player = player
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]))
    if (this.definitions.size !== definitions.length) throw new Error('Enemy definition IDs must be unique')
  }

  get aliveCount(): number {
    return this.enemies.size
  }

  getAlive(): readonly Enemy[] {
    return Array.from(this.enemies.values())
  }

  onDeath(listener: (event: EnemyDeathEvent) => void): () => void {
    this.deathListeners.add(listener)
    return () => this.deathListeners.delete(listener)
  }

  spawn(definitionId: string, requestedPosition: THREE.Vector3, minimumPlayerDistance = 6): Enemy {
    const enemy = this.trySpawn(definitionId, requestedPosition, minimumPlayerDistance)
    if (!enemy) throw new Error(`No valid spawn position found for: ${definitionId}`)
    return enemy
  }

  trySpawn(definitionId: string, requestedPosition: THREE.Vector3, minimumPlayerDistance = 6): Enemy | null {
    const definition = this.definitions.get(definitionId)
    if (!definition) throw new Error(`Unknown enemy definition: ${definitionId}`)
    const position = this.findValidSpawn(definition, requestedPosition, minimumPlayerDistance)
    if (!position) return null
    const sequence = (this.counters.get(definitionId) ?? 0) + 1
    this.counters.set(definitionId, sequence)
    const combatId = `${definitionId}:${sequence}`
    const factory = BEHAVIOR_FACTORIES[definition.behavior.type]
    const enemy = new Enemy(
      combatId,
      definition,
      position,
      factory(definition.behavior),
      this.combat,
      this.obstacles,
      (deadEnemy, event) => this.removeDeadEnemy(deadEnemy, event),
    )
    this.enemies.set(combatId, enemy)
    this.parent.add(enemy.root)
    this.combat.registerTarget(enemy)
    return enemy
  }

  update(deltaTime: number): void {
    const snapshot = Array.from(this.enemies.values())
    for (const enemy of snapshot) {
      if (!this.enemies.has(enemy.combatId)) continue
      enemy.update(deltaTime, this.player, snapshot)
    }
  }

  dispose(): void {
    for (const enemy of this.enemies.values()) {
      this.combat.unregisterTarget(enemy.combatId)
      enemy.dispose()
    }
    this.enemies.clear()
    this.deathListeners.clear()
  }

  private findValidSpawn(definition: EnemyDefinition, requested: THREE.Vector3, minimumPlayerDistance: number): THREE.Vector3 | null {
    const player = this.player.getCombatBounds()
    for (const offset of this.spawnOffsets) {
      const x = requested.x + offset.x
      const z = requested.z + offset.y
      if (Math.hypot(x - player.x, z - player.z) < minimumPlayerDistance + definition.collisionRadius + player.radius) continue
      if (!this.clearOfObstacles(x, z, definition.collisionRadius)) continue
      if (!this.clearOfEnemies(x, z, definition.collisionRadius)) continue
      return new THREE.Vector3(x, 0, z)
    }
    return null
  }

  private clearOfObstacles(x: number, z: number, radius: number): boolean {
    return this.obstacles.every((obstacle) => {
      const closestX = THREE.MathUtils.clamp(x, obstacle.min.x, obstacle.max.x)
      const closestZ = THREE.MathUtils.clamp(z, obstacle.min.y, obstacle.max.y)
      return (x - closestX) ** 2 + (z - closestZ) ** 2 >= radius * radius
    })
  }

  private clearOfEnemies(x: number, z: number, radius: number): boolean {
    return Array.from(this.enemies.values()).every((enemy) => {
      const bounds = enemy.getCombatBounds()
      return Math.hypot(x - bounds.x, z - bounds.z) >= radius + bounds.radius + 0.5
    })
  }

  private removeDeadEnemy(enemy: Enemy, event: EnemyDeathEvent): void {
    if (!this.enemies.delete(enemy.combatId)) return
    this.combat.unregisterTarget(enemy.combatId)
    enemy.dispose()
    for (const listener of this.deathListeners) listener(event)
  }

  private createSpawnOffsets(): THREE.Vector2[] {
    const offsets = [new THREE.Vector2()]
    for (let ring = 1; ring <= 8; ring++) {
      const radius = ring * 0.9
      for (let index = 0; index < 8; index++) {
        const angle = index * Math.PI / 4
        offsets.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius))
      }
    }
    return offsets
  }
}