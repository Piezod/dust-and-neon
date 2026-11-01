import * as THREE from 'three'
import type { CombatSystem } from '../combat/CombatSystem'
import type { CombatBounds, CombatSource, DamageContext } from '../combat/Combat.types'
import type { Damageable } from '../combat/Damageable'
import type { GameEventBus } from '../events/GameEventBus'
import type { EnemyHazardManager } from '../enemies/EnemyHazardManager'
import { findGridPath, hasClearMovementSegment, hasLineOfSight, isNavigationPointClear } from '../enemies/EnemyNavigation'
import type { BossDefinition, BossSnapshot, BossState } from './Boss.types'
import { BossAttackController, type BossAttackContext } from './BossAttackController'
import { BossPhaseController } from './BossPhaseController'
import { BossVisual } from './BossVisual'

export interface BossOptions {
  readonly definition: BossDefinition
  readonly position: THREE.Vector3
  readonly scene: THREE.Scene
  readonly combat: CombatSystem
  readonly player: Damageable
  readonly obstacles: readonly THREE.Box2[]
  readonly hazards: EnemyHazardManager
  readonly events?: GameEventBus
  readonly random?: () => number
  readonly summon: (enemyId: string, count: number) => void
  readonly onDefeated: (boss: Boss) => void
}

export class Boss implements Damageable {
  readonly faction = 'enemies'
  readonly combatId: string
  readonly root: THREE.Group
  readonly definition: BossDefinition
  readonly phases: BossPhaseController
  readonly attacks: BossAttackController
  private readonly visual: BossVisual
  private readonly combat: CombatSystem
  private readonly player: Damageable
  private readonly obstacles: readonly THREE.Box2[]
  private readonly hazards: EnemyHazardManager
  private readonly events?: GameEventBus
  private readonly random: () => number
  private readonly summon: (enemyId: string, count: number) => void
  private readonly onDefeated: (boss: Boss) => void
  private readonly path: THREE.Vector3[] = []
  private pathIndex = 0
  private replanIn = 0
  private stateValue: BossState = 'intro'
  private health: number
  private introRemaining = 1.8
  private defeatedNotified = false

  constructor(options: BossOptions) {
    this.definition = options.definition
    this.combat = options.combat
    this.player = options.player
    this.obstacles = options.obstacles
    this.hazards = options.hazards
    this.events = options.events
    this.random = options.random ?? Math.random
    this.summon = options.summon
    this.onDefeated = options.onDefeated
    this.combatId = `boss:${options.definition.id}`
    this.health = options.definition.maxHealth
    this.visual = new BossVisual(options.definition, options.scene)
    this.root = this.visual.root
    this.root.position.copy(options.position)
    this.phases = new BossPhaseController(options.definition.phases)
    const source: CombatSource = { id: this.combatId, faction: this.faction }
    this.attacks = new BossAttackController(options.definition.attacks, source, (attack, phase, progress, target) => {
      this.visual.showAttack(phase === null ? null : {
        attackId: attack.id,
        phase,
        progress,
        telegraph: attack.telegraph,
        targetPosition: [target.x, target.y, target.z],
      }, attack, this.root.position)
      this.events?.emit({
        type: 'boss-attack-phase',
        bossId: this.definition.id,
        attackId: attack.id,
        phase,
        progress,
        position: [this.root.position.x, this.root.position.y, this.root.position.z],
      })
    })
  }

  get state(): BossState {
    return this.stateValue
  }

  get currentHealth(): number {
    return this.health
  }

  get isDefeated(): boolean {
    return this.stateValue === 'defeated' || this.stateValue === 'disposed'
  }

  get isCombatReady(): boolean {
    return this.stateValue === 'combat'
  }

  get deathAnimationFinished(): boolean {
    return this.stateValue === 'disposed'
  }

  getCombatBounds(): CombatBounds {
    return { x: this.root.position.x, z: this.root.position.z, radius: this.definition.collisionRadius }
  }

  getSnapshot(): BossSnapshot {
    return {
      id: this.definition.id,
      name: this.definition.name,
      phaseId: this.phases.current.id,
      phaseIndex: this.phases.index,
      phaseCount: this.phases.getPhases().length,
      currentHealth: this.health,
      maxHealth: this.definition.maxHealth,
      healthRatio: this.health / this.definition.maxHealth,
      state: this.stateValue,
      attack: this.attacks.state,
    }
  }

  applyDamage(context: DamageContext): void {
    if (this.stateValue !== 'combat' || context.sourceFaction === this.faction || context.sourceId === this.combatId) return
    if (!Number.isFinite(context.amount) || context.amount <= 0) return
    const previousHealth = this.health
    this.health = Math.max(0, this.health - context.amount)
    const amount = previousHealth - this.health
    this.visual.flashOnHit()
    this.events?.emit({ type: 'boss-damaged', bossId: this.definition.id, amount, currentHealth: this.health, maxHealth: this.definition.maxHealth })
    for (const phase of this.phases.advance(this.health / this.definition.maxHealth)) {
      this.hazards.removeOwner(this.combatId)
      this.attacks.cancel()
      this.visual.setPhase(phase)
      this.events?.emit({ type: 'boss-phase-changed', bossId: this.definition.id, phaseId: phase.id, phaseIndex: this.phases.index })
      if (phase.enterSoundId) this.events?.emit({ type: 'boss-phase-audio', soundId: phase.enterSoundId })
    }
    if (this.health === 0) this.die()
  }

  update(deltaTime: number): void {
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    if (this.stateValue === 'intro') {
      this.introRemaining = Math.max(0, this.introRemaining - elapsed)
      this.visual.update(elapsed)
      if (this.introRemaining === 0) {
        this.stateValue = 'combat'
        this.events?.emit({ type: 'boss-started', bossId: this.definition.id })
      }
      return
    }
    if (this.stateValue === 'defeated') {
      this.visual.update(elapsed)
      if (this.visual.deathAnimationFinished) this.stateValue = 'disposed'
      return
    }
    if (this.stateValue !== 'combat') return

    const playerBounds = this.player.getCombatBounds()
    const distance = this.distanceTo(playerBounds)
    const target = new THREE.Vector3(playerBounds.x, 0, playerBounds.z)
    const hasLos = hasLineOfSight(this.root.position, target, this.obstacles)
    this.replanIn = Math.max(0, this.replanIn - elapsed)
    if (this.attacks.phase === null) this.moveIntoPosition(elapsed, distance, target, playerBounds.radius, hasLos)
    this.attacks.update(elapsed, this.phases.current.attackIds, this.createAttackContext())
    this.visual.update(elapsed)
  }

  dispose(): void {
    this.hazards.removeOwner(this.combatId)
    this.attacks.dispose()
    this.visual.dispose()
    this.stateValue = 'disposed'
  }

  private moveIntoPosition(deltaTime: number, distance: number, target: THREE.Vector3, playerRadius: number, hasLos: boolean): void {
    const style = this.definition.movement
    let desired = new THREE.Vector3()
    const error = distance - this.definition.preferredDistance
    if (style === 'approach' && error > 0.6 || style === 'hold' && Math.abs(error) > 0.8) {
      desired.copy(target).sub(this.root.position).setY(0)
      if (style === 'hold' && error < 0) desired.negate()
      if (desired.lengthSq() > 0) desired.normalize()
    } else if (style === 'orbit' && hasLos && Math.abs(error) < 1.2) {
      const radial = this.root.position.clone().sub(target).setY(0)
      if (radial.lengthSq() > 0) desired.set(-radial.z, 0, radial.x).normalize().multiplyScalar(0.35)
    } else if (error > 1.2) {
      desired.copy(target).sub(this.root.position).setY(0)
      if (desired.lengthSq() > 0) desired.normalize()
    }
    if (desired.lengthSq() === 0) return
    const phaseSpeed = this.definition.moveSpeed * this.phases.current.moveSpeedMultiplier
    const direct = this.root.position.clone().addScaledVector(desired, Math.min(phaseSpeed * deltaTime, 0.12))
    const blocked = !hasClearMovementSegment(this.root.position, direct, this.obstacles, this.definition.collisionRadius)
    if (blocked || !hasLos && style !== 'orbit') {
      if (this.replanIn === 0 || this.path.length === 0) {
        const path = findGridPath(this.root.position, target, this.obstacles, this.definition.collisionRadius)
        this.path.length = 0
        this.path.push(...(path ?? []))
        this.pathIndex = 0
        this.replanIn = 0.6
      }
      while (this.pathIndex < this.path.length && this.root.position.distanceToSquared(this.path[this.pathIndex]) < 0.05 ** 2) this.pathIndex++
      if (this.pathIndex < this.path.length) desired.subVectors(this.path[this.pathIndex], this.root.position).setY(0).normalize()
      else return
    } else {
      this.path.length = 0
      this.pathIndex = 0
    }
    const step = phaseSpeed * deltaTime
    const candidate = this.root.position.clone().addScaledVector(desired, step)
    if (isNavigationPointClear(candidate, this.obstacles, this.definition.collisionRadius)
      && Math.hypot(candidate.x - target.x, candidate.z - target.z) > this.definition.collisionRadius + playerRadius) {
      this.root.position.copy(candidate)
    }
  }

  private createAttackContext(): BossAttackContext {
    return {
      bossPosition: this.root.position,
      bossRadius: this.definition.collisionRadius,
      bossSpeed: this.definition.moveSpeed * this.phases.current.moveSpeedMultiplier,
      player: this.player,
      combat: this.combat,
      obstacles: this.obstacles,
      hazards: this.hazards,
      summon: this.summon,
      random: this.random,
      moveBoss: (direction, distance) => {
        const count = Math.max(1, Math.ceil(distance / Math.max(0.12, this.definition.collisionRadius * 0.35)))
        for (let step = 0; step < count; step++) {
          const candidate = this.root.position.clone().addScaledVector(direction, distance / count)
          if (!isNavigationPointClear(candidate, this.obstacles, this.definition.collisionRadius)) break
          this.root.position.copy(candidate)
        }
      },
    }
  }

  private distanceTo(bounds: CombatBounds): number {
    return Math.hypot(this.root.position.x - bounds.x, this.root.position.z - bounds.z)
  }

  private die(): void {
    if (this.defeatedNotified) return
    this.defeatedNotified = true
    this.stateValue = 'defeated'
    this.hazards.removeOwner(this.combatId)
    this.attacks.cancel()
    this.visual.startDeath(0.55)
    this.events?.emit({ type: 'boss-defeated', bossId: this.definition.id })
    this.onDefeated(this)
  }
}
