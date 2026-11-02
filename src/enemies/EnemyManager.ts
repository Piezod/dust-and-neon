import * as THREE from 'three'
import type { CombatSystem } from '../combat/CombatSystem'
import type { Damageable } from '../combat/Damageable'
import { ChaseBehavior } from './ChaseBehavior'
import type { EnemyBehaviorFactory } from './EnemyBehavior'
import { Enemy } from './Enemy'
import { KeepDistanceBehavior } from './KeepDistanceBehavior'
import type { EnemyDeathEvent, EnemyDefinition, EnemyBehaviorDefinition, EnemySpawnDifficulty } from './Enemy.types'
import type { GameEventBus } from '../events/GameEventBus'
import { EnemyHazardManager } from './EnemyHazardManager'

const BEHAVIOR_FACTORIES: Readonly<Record<EnemyBehaviorDefinition['type'], EnemyBehaviorFactory>> = {
  chase: (definition) => {
    if (definition.type !== 'chase') throw new TypeError('Chase behavior configuration mismatch')
    return new ChaseBehavior(definition.stopDistance)
  },
  'keep-distance': (definition) => {
    if (definition.type !== 'keep-distance') throw new TypeError('Keep-distance behavior configuration mismatch')
    return new KeepDistanceBehavior(definition.preferredDistance, definition.tolerance)
  },
  strafe: (definition) => {
    if (definition.type !== 'strafe') throw new TypeError('Strafe behavior configuration mismatch')
    return {
      getDirection(position, target, output) {
        const radial = output.subVectors(position, target).setY(0)
        const distance = radial.length()
        if (distance < 1e-8) return output.set(1, 0, 0)
        if (distance > definition.preferredDistance + definition.tolerance) return output.negate().normalize()
        if (distance < definition.preferredDistance - definition.tolerance) return output.normalize()
        return output.set(-radial.z / distance, 0, radial.x / distance).multiplyScalar(definition.orbitSpeed)
      },
    }
  },
  hold: (definition) => {
    if (definition.type !== 'hold') throw new TypeError('Hold behavior configuration mismatch')
    return { getDirection: (_position, _target, output) => output.set(0, 0, 0) }
  },
}

export class EnemyManager {
  private readonly enemies = new Map<string, Enemy>()
  private readonly dyingEnemies = new Map<string, Enemy>()
  private readonly deathAnimationSeconds: number
  private readonly counters = new Map<string, number>()
  private readonly deathListeners = new Set<(event: EnemyDeathEvent) => void>()
  private readonly definitions: ReadonlyMap<string, EnemyDefinition>
  private readonly spawnOffsets = this.createSpawnOffsets()
  private readonly parent: THREE.Object3D
  private readonly obstacles: readonly THREE.Box2[]
  private readonly combat: CombatSystem
  private readonly player: Damageable
  private readonly events?: GameEventBus
  private readonly targetProvider?: () => readonly Damageable[]
  private readonly random: () => number
  readonly hazards: EnemyHazardManager

  constructor(
    parent: THREE.Object3D,
    obstacles: readonly THREE.Box2[],
    combat: CombatSystem,
    player: Damageable,
    definitions: readonly EnemyDefinition[],
    events?: GameEventBus,
    deathAnimationSeconds = 0.38,
    targetProvider?: () => readonly Damageable[],
    random: () => number = Math.random,
  ) {
    this.parent = parent
    this.obstacles = obstacles
    this.combat = combat
    this.player = player
    this.events = events
    this.targetProvider = targetProvider
    this.random = random
    this.hazards = new EnemyHazardManager(parent, obstacles, combat)
    this.deathAnimationSeconds = Math.max(0, Number.isFinite(deathAnimationSeconds) ? deathAnimationSeconds : 0.38)
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]))
    if (this.definitions.size !== definitions.length) throw new Error('Enemy definition IDs must be unique')
  }

  get aliveCount(): number {
    return this.enemies.size
  }

  get dyingCount(): number {
    return this.dyingEnemies.size
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

  trySpawn(definitionId: string, requestedPosition: THREE.Vector3, minimumPlayerDistance = 6, difficulty?: EnemySpawnDifficulty): Enemy | null {
    const definition = this.definitions.get(definitionId)
    if (!definition) throw new Error(`Unknown enemy definition: ${definitionId}`)
    const position = this.findValidSpawn(definition, requestedPosition, minimumPlayerDistance)
    if (!position) return null
    const scaledDefinition = this.applySpawnDifficulty(definition, difficulty)
    const sequence = (this.counters.get(definitionId) ?? 0) + 1
    this.counters.set(definitionId, sequence)
    const combatId = `${definitionId}:${sequence}`
    const factory = BEHAVIOR_FACTORIES[definition.behavior.type]
    const enemy = new Enemy(
      combatId,
      scaledDefinition,
      position,
      factory(definition.behavior),
      this.combat,
      this.obstacles,
      (deadEnemy, event) => this.removeDeadEnemy(deadEnemy, event),
      this.events,
      this.hazards,
      this.random,
    )
    this.enemies.set(combatId, enemy)
    this.parent.add(enemy.root)
    this.combat.registerTarget(enemy)
    this.events?.emit({
      type: 'enemy-spawned',
      enemyId: combatId,
      definitionId: scaledDefinition.id,
      position: [enemy.root.position.x, enemy.root.position.y, enemy.root.position.z],
      soundId: definition.sounds?.spawn,
    })
    return enemy
  }

  update(deltaTime: number): void {
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    const snapshot = Array.from(this.enemies.values())
    const targets = this.getTargets()
    for (const enemy of snapshot) {
      if (!this.enemies.has(enemy.combatId)) continue
      const target = this.getNearestTarget(enemy, targets)
      if (target) enemy.update(elapsed, target, snapshot, targets)
      else enemy.cancelExperimentalAttack()
    }
    for (const [id, enemy] of this.dyingEnemies) {
      if (!enemy.updateDeathAnimation(elapsed)) continue
      this.dyingEnemies.delete(id)
      enemy.dispose()
    }
    this.hazards.update(elapsed, targets)
  }

  dispose(): void {
    this.clear()
    this.deathListeners.clear()
  }

  clear(): void {
    for (const enemy of this.enemies.values()) {
      this.combat.unregisterTarget(enemy.combatId)
      enemy.dispose()
    }
    this.enemies.clear()
    for (const enemy of this.dyingEnemies.values()) enemy.dispose()
    this.dyingEnemies.clear()
    this.hazards.clear()
  }

  private findValidSpawn(definition: EnemyDefinition, requested: THREE.Vector3, minimumPlayerDistance: number): THREE.Vector3 | null {
    const players = this.getTargets().map((target) => target.getCombatBounds())
    for (const offset of this.spawnOffsets) {
      const x = requested.x + offset.x
      const z = requested.z + offset.y
      if (players.some((player) => Math.hypot(x - player.x, z - player.z) < minimumPlayerDistance + definition.collisionRadius + player.radius)) continue
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
      const bounds = enemy.getPhysicalBounds()
      return Math.hypot(x - bounds.x, z - bounds.z) >= radius + bounds.radius + 0.5
    })
  }

  private getTargets(): readonly Damageable[] {
    return this.targetProvider ? this.targetProvider() : [this.player]
  }

  private getNearestTarget(enemy: Enemy, targets: readonly Damageable[]): Damageable | null {
    let nearest: Damageable | null = null
    let nearestDistance = Infinity
    const enemyBounds = enemy.getCombatBounds()
    for (const target of targets) {
      const bounds = target.getCombatBounds()
      const distance = (enemyBounds.x - bounds.x) ** 2 + (enemyBounds.z - bounds.z) ** 2
      if (distance < nearestDistance) {
        nearest = target
        nearestDistance = distance
      }
    }
    return nearest
  }

  private applySpawnDifficulty(definition: EnemyDefinition, difficulty?: EnemySpawnDifficulty): EnemyDefinition {
    if (!difficulty) return definition
    const healthMultiplier = this.validateMultiplier(difficulty.healthMultiplier, 0.5, 3, 'health')
    const damageMultiplier = this.validateMultiplier(difficulty.damageMultiplier, 0.5, 3, 'damage')
    const speedMultiplier = this.validateMultiplier(difficulty.speedMultiplier, 0.5, 1.5, 'speed')
    const cooldownMultiplier = this.validateMultiplier(difficulty.cooldownMultiplier, 0.5, 2, 'cooldown')
    const projectileSpeedMultiplier = this.validateMultiplier(difficulty.projectileSpeedMultiplier ?? 1, 0.75, 1.25, 'projectile speed')
    const telegraphMultiplier = this.validateMultiplier(difficulty.telegraphMultiplier ?? 1, 0.85, 1.35, 'telegraph')
    return {
      ...definition,
      maxHealth: Math.max(1, Math.round(definition.maxHealth * healthMultiplier)),
      moveSpeed: definition.moveSpeed * speedMultiplier,
      attacks: definition.attacks.map((attack) => ({
        ...attack,
        cooldownSeconds: Math.max(0.2, attack.cooldownSeconds * cooldownMultiplier),
        ...(attack.windupSeconds !== undefined ? { windupSeconds: Math.max(0.3, attack.windupSeconds * telegraphMultiplier) } : {}),
        damage: Math.max(0, Math.round(attack.damage * damageMultiplier)),
        projectile: attack.projectile ? {
          ...attack.projectile,
          damage: Math.max(0, Math.round(attack.projectile.damage * damageMultiplier)),
          projectileSpeed: attack.projectile.projectileSpeed * projectileSpeedMultiplier,
        } : undefined,
      })),
    }
  }

  private validateMultiplier(value: number, minimum: number, maximum: number, label: string): number {
    if (!Number.isFinite(value) || value < minimum || value > maximum) throw new RangeError(`Invalid enemy ${label} multiplier`)
    return value
  }

  private removeDeadEnemy(enemy: Enemy, event: EnemyDeathEvent): void {
    if (!this.enemies.delete(enemy.combatId)) return
    this.combat.unregisterTarget(enemy.combatId)
    this.hazards.removeOwner(enemy.combatId)
    enemy.beginDeathAnimation(this.deathAnimationSeconds)
    if (this.deathAnimationSeconds <= 0) enemy.dispose()
    else this.dyingEnemies.set(enemy.combatId, enemy)
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