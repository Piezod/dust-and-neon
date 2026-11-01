import * as THREE from 'three'
import type { CombatSystem } from '../combat/CombatSystem'
import type { CombatBounds, CombatSource, DamageContext, DamageStatusApplication, DamageType } from '../combat/Combat.types'
import type { Damageable } from '../combat/Damageable'
import type { EnemyBehavior } from './EnemyBehavior'
import { EnemyAttackController } from './EnemyAttackController'
import { EnemyVisual } from './EnemyVisual'
import type { EnemyDefinition, EnemyDeathEvent, EnemyState } from './Enemy.types'
import type { GameEventBus } from '../events/GameEventBus'
import { findGridPath, hasClearMovementSegment, hasLineOfSight, isNavigationPointClear } from './EnemyNavigation'
import { ENEMY_BALANCE } from '../config/enemyBalance.config'
import { StatusEffects } from '../combat/StatusEffects'
import { ExperimentalAttackController, type ExperimentalEnemyAttackContext } from './ExperimentalAttackController'
import type { EnemyHazardManager } from './EnemyHazardManager'

export class Enemy implements Damageable {
  readonly root: THREE.Group
  readonly faction = 'enemies'
  readonly attackController: EnemyAttackController
  private readonly visual: EnemyVisual
  private readonly direction = new THREE.Vector3()
  private readonly candidate = new THREE.Vector3()
  private readonly separationDirection = new THREE.Vector3()
  private readonly radialDirection = new THREE.Vector3()
  private readonly navigationGoal = new THREE.Vector3()
  private readonly navigationPath: THREE.Vector3[] = []
  private navigationWaypoint = 0
  private navigationReplanIn = 0
  private navigationStalledFor = 0
  private hasLineOfSightValue = true
  private health: number
  private stateValue: EnemyState = 'idle'
  private deathNotified = false
  readonly combatId: string
  readonly definition: EnemyDefinition
  private readonly obstacles: readonly THREE.Box2[]
  private readonly onDeath: (enemy: Enemy, event: EnemyDeathEvent) => void
  private readonly events?: GameEventBus
  private readonly combat: CombatSystem
  private readonly experimentalHazardManager: EnemyHazardManager
  private readonly randomSource: () => number
  private readonly orbitSign: number
  private readonly statusEffects = new StatusEffects()
  private readonly experimentalAttackController: ExperimentalAttackController | null

  constructor(
    combatId: string,
    definition: EnemyDefinition,
    position: THREE.Vector3,
    behavior: EnemyBehavior,
    combat: CombatSystem,
    obstacles: readonly THREE.Box2[],
    onDeath: (enemy: Enemy, event: EnemyDeathEvent) => void,
    events: GameEventBus | undefined,
    hazards: EnemyHazardManager,
    random: () => number = Math.random,
  ) {
    this.combatId = combatId
    this.definition = definition
    this.obstacles = obstacles
    this.onDeath = onDeath
    this.events = events
    this.combat = combat
    this.experimentalHazardManager = hazards
    this.randomSource = random
    if (definition.experimental) hazards.setOwnerLimit(combatId, definition.experimental.maxGeneratedEntities)
    this.orbitSign = combatId.charCodeAt(combatId.length - 1) % 2 === 0 ? 1 : -1
    this.health = definition.maxHealth
    this.visual = new EnemyVisual(definition.visual)
    this.root = this.visual.root
    this.root.name = `Enemy:${definition.id}:${combatId}`
    this.root.position.copy(position)
    this.behavior = behavior
    const source: CombatSource = { id: combatId, faction: this.faction }
    this.attackController = new EnemyAttackController(definition.attacks, source, combat, (attackId, phase, progress) => {
      const attack = definition.attacks.find((entry) => entry.id === attackId)
      this.events?.emit({
        type: 'enemy-attack-phase',
        enemyId: this.combatId,
        attackId,
        phase,
        progress,
        position: [this.root.position.x, this.definition.visual.bodyHeight * 0.6, this.root.position.z],
      })
      this.visual.setAttackPhase(phase === null ? null : this.attackController?.getPhaseState() ?? null, attack?.type ?? 'melee')
    })
    this.experimentalAttackController = definition.experimental
      ? new ExperimentalAttackController(definition.experimental.attacks, source, (attack, phase, progress, target) => {
        this.visual.setPatternAttack(attack, phase, progress, target)
        if (attack) {
          this.events?.emit({
            type: 'enemy-attack-phase',
            enemyId: this.combatId,
            attackId: attack.id,
            phase,
            progress,
            position: [this.root.position.x, this.definition.visual.bodyHeight * 0.6, this.root.position.z],
          })
        }
      })
      : null
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

  get hasLineOfSightToTarget(): boolean {
    return this.hasLineOfSightValue
  }

  get currentExperimentalAttack(): import('./Enemy.types').EnemyAttackPhaseState | null {
    return this.experimentalAttackController?.phaseState ?? null
  }

  get activeStatusEffects(): readonly DamageStatusApplication['type'][] {
    return this.statusEffects.activeTypes
  }

  get isStaggered(): boolean {
    return this.statusEffects.isStaggered
  }

  get navigationWaypoints(): readonly THREE.Vector3[] {
    return this.navigationPath.slice(this.navigationWaypoint).map((point) => point.clone())
  }

  get navigationGoalPoint(): THREE.Vector3 | null {
    return this.navigationPath.length > 0 ? this.navigationGoal.clone() : null
  }

  cancelExperimentalAttack(): void {
    this.experimentalAttackController?.cancel()
    this.visual.setPatternAttack(null, null, 0, this.root.position)
  }

  getCombatBounds(): CombatBounds {
    return { x: this.root.position.x, z: this.root.position.z, radius: this.definition.collisionRadius }
  }

  getDamageMultiplier(type: DamageType, sourcePosition?: readonly [number, number, number]): number {
    let multiplier = this.definition.resistances?.[type] ?? 1
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 2.5) multiplier = 1
    const armor = this.definition.frontResistance
    if (!armor || !sourcePosition || armor.halfAngleRadians < 0 || armor.halfAngleRadians > Math.PI / 2) return multiplier
    const sourceX = sourcePosition[0] - this.root.position.x
    const sourceZ = sourcePosition[2] - this.root.position.z
    const length = Math.hypot(sourceX, sourceZ)
    if (length <= 1e-6) return multiplier
    const facingX = Math.sin(this.root.rotation.y)
    const facingZ = Math.cos(this.root.rotation.y)
    const dot = (sourceX * facingX + sourceZ * facingZ) / length
    if (dot >= Math.cos(armor.halfAngleRadians)) multiplier *= Math.max(0.1, Math.min(1, armor.damageMultiplier))
    return multiplier
  }

  applyStatusEffect(effect: DamageStatusApplication, source: { readonly id: string; readonly faction: string }): void {
    if (this.isDead || !this.statusEffects.apply(effect, source)) return
    const duration = effect.type === 'shock' ? effect.staggerSeconds : effect.durationSeconds
    this.events?.emit({ type: 'damage-status-applied', targetId: this.combatId, status: effect.type, durationSeconds: Math.min(duration, 8) })
  }

  applyDamage(context: DamageContext): void {
    if (this.isDead || context.sourceId === this.combatId || context.sourceFaction === this.faction) return
    if (!Number.isFinite(context.amount) || context.amount <= 0) return
    const previousHealth = this.health
    this.health = Math.max(0, this.health - context.amount)
    const actualDamage = previousHealth - this.health
    this.events?.emit({
      type: 'enemy-damaged',
      enemyId: this.combatId,
      amount: actualDamage,
      damageType: context.type,
      position: [this.root.position.x, this.root.position.y + this.definition.visual.bodyHeight * 0.45, this.root.position.z],
      soundId: this.definition.sounds?.damaged,
    })
    this.visual.flashOnHit(actualDamage)
    this.visual.updateHealth(this.health / this.definition.maxHealth)
    if (this.health === 0) this.die()
  }

  update(deltaTime: number, player: Damageable, otherEnemies: readonly Enemy[], targets: readonly Damageable[] = [player]): void {
    if (this.isDead) return
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    this.statusEffects.update(elapsed, (context) => this.combat.applyDamage(this, context))
    if (this.isDead) return
    if (this.statusEffects.isStaggered) {
      this.clearNavigation()
      this.visual.update(elapsed)
      return
    }
    this.visual.update(elapsed)
    const playerBounds = player.getCombatBounds()
    const detected = this.distanceTo(playerBounds.x, playerBounds.z) <= this.definition.detectionRange
    this.stateValue = detected ? 'pursuing' : 'idle'
    const targetGround = new THREE.Vector3(playerBounds.x, this.root.position.y, playerBounds.z)
    this.hasLineOfSightValue = hasLineOfSight(this.root.position, targetGround, this.obstacles)
    const activePrototypeState = this.experimentalAttackController?.phaseState
    const activePrototypeAttack = activePrototypeState
      ? this.definition.experimental?.attacks.find((entry) => entry.id === activePrototypeState.attackId)
      : undefined
    const patternOwnsMovement = (activePrototypeState?.phase === 'windup' || activePrototypeState?.phase === 'active')
      && (activePrototypeAttack?.pattern?.kind === 'charge' || activePrototypeAttack?.pattern?.kind === 'leap' || activePrototypeAttack?.pattern?.kind === 'burrow')
    if (detected && elapsed > 0 && !patternOwnsMovement) this.updateNavigation(elapsed, playerBounds, targetGround, otherEnemies)
    else this.clearNavigation()
    const distance = this.distanceTo(playerBounds.x, playerBounds.z)
    this.hasLineOfSightValue = hasLineOfSight(this.root.position, targetGround, this.obstacles)
    const targetPosition = new THREE.Vector3(playerBounds.x, 0, playerBounds.z)
    if (this.experimentalAttackController && detected) {
      const lockedTarget = this.experimentalAttackController.lockedTargetPosition ?? targetPosition
      const facing = lockedTarget.clone().sub(this.root.position).setY(0)
      if (facing.lengthSq() > 1e-8) this.root.rotation.y = Math.atan2(facing.x, facing.z)
    }
    const origin = new THREE.Vector3(this.root.position.x, this.definition.visual.bodyHeight * 0.65, this.root.position.z)
    const phaseBeforeUpdate = this.experimentalAttackController?.phaseState ?? this.attackController.getPhaseState()
    const currentAttack = phaseBeforeUpdate
      ? (this.definition.experimental?.attacks ?? this.definition.attacks).find((entry) => entry.id === phaseBeforeUpdate.attackId)
      : undefined
    const inCurrentAttackRange = !currentAttack || distance >= currentAttack.minRange && distance <= currentAttack.maxRange
    const canAttack = detected && this.hasLineOfSightValue && inCurrentAttackRange
    const attackId = this.experimentalAttackController
      ? this.experimentalAttackController.update(elapsed, canAttack, distance, this.createExperimentalContext(player, otherEnemies, targets))
      : this.attackController.update(elapsed, canAttack, distance, origin, targetPosition, player)
    const phaseState = this.experimentalAttackController?.phaseState ?? this.attackController.getPhaseState()
    const phaseAttack = phaseState ? (this.definition.experimental?.attacks ?? this.definition.attacks).find((entry) => entry.id === phaseState.attackId) : undefined
    if (!this.experimentalAttackController) this.visual.setAttackPhase(this.hasLineOfSightValue ? phaseState : null, phaseAttack?.type ?? 'melee')
    if (phaseState) this.stateValue = 'attacking'
    if (attackId) {
      this.stateValue = 'attacking'
      const attack = (this.definition.experimental?.attacks ?? this.definition.attacks).find((entry) => entry.id === attackId)
      this.events?.emit({
        type: 'enemy-attacked',
        enemyId: this.combatId,
        attackId,
        position: [this.root.position.x, this.definition.visual.bodyHeight * 0.6, this.root.position.z],
        soundId: attack?.type === 'projectile' ? this.definition.sounds?.special ?? this.definition.sounds?.attack : this.definition.sounds?.attack,
      })
    }
    if (!this.experimentalAttackController && this.direction.lengthSq() > 0) this.root.rotation.y = Math.atan2(this.direction.x, this.direction.z)
  }

  dispose(): void {
    this.experimentalAttackController?.dispose()
    this.statusEffects.clear()
    this.visual.dispose()
  }

  beginDeathAnimation(durationSeconds = 0.38): void {
    this.visual.startDeathAnimation(durationSeconds)
  }

  updateDeathAnimation(deltaTime: number): boolean {
    this.visual.update(deltaTime)
    return this.visual.deathAnimationFinished
  }

  private updateNavigation(deltaTime: number, player: CombatBounds, target: THREE.Vector3, otherEnemies: readonly Enemy[]): void {
    this.navigationReplanIn = Math.max(0, this.navigationReplanIn - deltaTime)
    this.behavior.getDirection(this.root.position, target, this.direction)
    const distance = this.distanceTo(player.x, player.z)
    const preferredDistance = this.getPreferredDistance(player.radius)
    const tolerance = 'tolerance' in this.definition.behavior ? this.definition.behavior.tolerance : 0.12
    this.applyLocalSeparation(this.direction, player, otherEnemies, distance, preferredDistance, tolerance)
    const wantsMovement = this.direction.lengthSq() > 0
    const directDistance = Math.min(this.moveSpeed * deltaTime, Math.max(this.definition.collisionRadius * 0.5, 0.12))
    const directEnd = this.candidate.copy(this.root.position).addScaledVector(this.direction, directDistance)
    const directPathBlocked = wantsMovement
      && !hasClearMovementSegment(this.root.position, directEnd, this.obstacles, this.definition.collisionRadius)
    const targetInAttackRange = this.definition.attacks.some((attack) => distance >= attack.minRange && distance <= attack.maxRange)
    const needsNavigation = directPathBlocked || !this.hasLineOfSightValue && targetInAttackRange

    if (!needsNavigation) {
      this.clearNavigation()
      if (wantsMovement) this.move(this.direction, deltaTime, player, otherEnemies)
      return
    }

    const currentDistanceError = Math.abs(distance - preferredDistance)
    if (currentDistanceError <= tolerance && this.hasLineOfSightValue && !directPathBlocked) {
      this.clearNavigation()
      return
    }

    if (this.navigationReplanIn === 0) this.planNavigation(player, target, otherEnemies)
    this.followNavigationPath(deltaTime, player, otherEnemies)
  }

  private planNavigation(player: CombatBounds, target: THREE.Vector3, otherEnemies: readonly Enemy[]): void {
    this.navigationPath.length = 0
    this.navigationWaypoint = 0
    const preferred = this.getPreferredDistance(player.radius)
    const radii = this.definition.behavior.type === 'chase'
      ? [preferred, preferred + 0.18]
      : [preferred, preferred + 0.65, Math.max(this.definition.collisionRadius + player.radius + 0.12, preferred - 0.65)]
    const candidates: { readonly point: THREE.Vector3; readonly distanceSquared: number }[] = []
    for (const radius of radii) {
      for (let index = 0; index < 20; index++) {
        const angle = index * Math.PI * 2 / 20
        const point = new THREE.Vector3(target.x + Math.cos(angle) * radius, 0, target.z + Math.sin(angle) * radius)
        if (!isNavigationPointClear(point, this.obstacles, this.definition.collisionRadius)) continue
        if (!this.isClearOfEnemies(point.x, point.z, this.definition.collisionRadius, otherEnemies)) continue
        if (!hasLineOfSight(point, target, this.obstacles)) continue
        candidates.push({ point, distanceSquared: point.distanceToSquared(this.root.position) })
      }
    }
    candidates.sort((first, second) => first.distanceSquared - second.distanceSquared)
    for (const candidate of candidates) {
      const path = findGridPath(this.root.position, candidate.point, this.obstacles, this.definition.collisionRadius)
      if (!path) continue
      this.navigationPath.push(...path)
      this.navigationGoal.copy(candidate.point)
      break
    }
    this.navigationReplanIn = 0.55
    this.navigationStalledFor = 0
  }

  private followNavigationPath(deltaTime: number, player: CombatBounds, otherEnemies: readonly Enemy[]): void {
    while (this.navigationWaypoint < this.navigationPath.length) {
      const waypoint = this.navigationPath[this.navigationWaypoint]
      if (this.root.position.distanceToSquared(waypoint) > 0.055 ** 2) break
      this.navigationWaypoint++
    }
    if (this.navigationWaypoint >= this.navigationPath.length) return
    this.direction.subVectors(this.navigationPath[this.navigationWaypoint], this.root.position).setY(0)
    if (this.direction.lengthSq() < 1e-8) return
    this.direction.normalize()
    const moved = this.move(this.direction, deltaTime, player, otherEnemies)
    if (!moved && deltaTime > 0) this.navigationStalledFor += deltaTime
    else this.navigationStalledFor = 0
    if (this.navigationStalledFor >= 0.28) {
      this.navigationPath.length = 0
      this.navigationWaypoint = 0
      this.navigationReplanIn = 0
    }
  }

  private move(direction: THREE.Vector3, deltaTime: number, player: CombatBounds, otherEnemies: readonly Enemy[]): boolean {
    const distance = this.moveSpeed * deltaTime
    const stepLength = Math.max(this.definition.collisionRadius * 0.4, 0.12)
    const steps = Math.max(1, Math.ceil(distance / stepLength))
    const stepX = direction.x * distance / steps
    const stepZ = direction.z * distance / steps
    let movedAny = false
    for (let step = 0; step < steps; step++) {
      if (this.canOccupy(this.root.position.x + stepX, this.root.position.z, player, otherEnemies)) {
        this.root.position.x += stepX
        movedAny = true
      }
      if (this.canOccupy(this.root.position.x, this.root.position.z + stepZ, player, otherEnemies)) {
        this.root.position.z += stepZ
        movedAny = true
      }
    }
    return movedAny
  }

  private getPreferredDistance(playerRadius: number): number {
    if ('preferredDistance' in this.definition.behavior) return this.definition.behavior.preferredDistance
    return Math.max(this.definition.behavior.stopDistance, this.definition.collisionRadius + playerRadius + 0.12)
  }

  private get moveSpeed(): number {
    return this.definition.moveSpeed * this.statusEffects.movementMultiplier
  }

  private createExperimentalContext(player: Damageable, otherEnemies: readonly Enemy[], targets: readonly Damageable[]): ExperimentalEnemyAttackContext {
    return {
      position: this.root.position,
      orientation: this.root.rotation.y,
      collisionRadius: this.definition.collisionRadius,
      enemyHeight: this.definition.visual.bodyHeight,
      target: player,
      targets,
      obstacles: this.obstacles,
      combat: this.combat,
      hazards: this.experimentalHazardManager,
      move: (direction, distance) => {
        const before = this.root.position.clone()
        if (this.moveSpeed > 1e-6) this.move(direction, distance / this.moveSpeed, player.getCombatBounds(), otherEnemies)
        return before.distanceTo(this.root.position)
      },
      setBurrowed: (burrowed) => this.visual.setBurrowed(burrowed),
      detonate: () => this.die(),
      random: this.randomSource,
    }
  }

  private applyLocalSeparation(
    direction: THREE.Vector3,
    player: CombatBounds,
    otherEnemies: readonly Enemy[],
    distance: number,
    preferredDistance: number,
    tolerance: number,
  ): void {
    if (this.definition.behavior.type === 'keep-distance'
      && direction.lengthSq() === 0
      && this.hasLineOfSightValue
      && Math.abs(distance - preferredDistance) <= tolerance) {
      this.radialDirection.set(this.root.position.x - player.x, 0, this.root.position.z - player.z)
      if (this.radialDirection.lengthSq() > 1e-8) {
        this.radialDirection.normalize()
        direction.set(-this.radialDirection.z * this.orbitSign, 0, this.radialDirection.x * this.orbitSign)
          .multiplyScalar(ENEMY_BALANCE.separation.orbitSpeed)
      }
    }

    this.separationDirection.set(0, 0, 0)
    const separationDistance = ENEMY_BALANCE.separation.radius
    for (const other of otherEnemies) {
      if (other === this || other.isDead) continue
      const bounds = other.getCombatBounds()
      const deltaX = this.root.position.x - bounds.x
      const deltaZ = this.root.position.z - bounds.z
      const separationRange = this.definition.collisionRadius + bounds.radius + separationDistance
      const currentDistance = Math.hypot(deltaX, deltaZ)
      if (currentDistance <= 1e-6 || currentDistance >= separationRange) continue
      const weight = (separationRange - currentDistance) / separationRange
      this.separationDirection.x += deltaX / currentDistance * weight
      this.separationDirection.z += deltaZ / currentDistance * weight
    }
    if (this.separationDirection.lengthSq() === 0) return
    this.separationDirection.normalize()
    if (direction.lengthSq() === 0) direction.copy(this.separationDirection)
    else direction.addScaledVector(this.separationDirection, ENEMY_BALANCE.separation.strength)
    if (direction.lengthSq() > 1) direction.normalize()
  }

  private isClearOfEnemies(x: number, z: number, radius: number, otherEnemies: readonly Enemy[]): boolean {
    return otherEnemies.every((other) => {
      if (other === this || other.isDead) return true
      const bounds = other.getCombatBounds()
      return Math.hypot(x - bounds.x, z - bounds.z) >= radius + bounds.radius + 0.12
    })
  }

  private clearNavigation(): void {
    this.navigationPath.length = 0
    this.navigationWaypoint = 0
    this.navigationReplanIn = 0
    this.navigationStalledFor = 0
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
    this.statusEffects.clear()
    this.experimentalAttackController?.dispose()
    const event: EnemyDeathEvent = {
      enemyId: this.combatId,
      definitionId: this.definition.id,
      position: [this.root.position.x, this.root.position.y, this.root.position.z],
      lootTableId: this.definition.lootTableId,
    }
    this.events?.emit({ type: 'enemy-killed', death: event, soundId: this.definition.sounds?.death })
    this.onDeath(this, event)
  }
}