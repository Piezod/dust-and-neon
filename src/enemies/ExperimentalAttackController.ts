import * as THREE from 'three'
import type { CombatSource } from '../combat/Combat.types'
import type { CombatSystem } from '../combat/CombatSystem'
import type { Damageable } from '../combat/Damageable'
import type { EnemyAttackDefinition, EnemyAttackPhase, EnemyAttackPhaseState, EnemyAttackPattern } from './Enemy.types'
import type { EnemyHazardManager } from './EnemyHazardManager'
import { hasLineOfSight } from './EnemyNavigation'

export interface ExperimentalEnemyAttackContext {
  readonly position: THREE.Vector3
  readonly orientation: number
  readonly collisionRadius: number
  readonly enemyHeight: number
  readonly target: Damageable
  readonly targets: readonly Damageable[]
  readonly obstacles: readonly THREE.Box2[]
  readonly combat: CombatSystem
  readonly hazards: EnemyHazardManager
  readonly move: (direction: THREE.Vector3, distance: number) => number
  readonly setBurrowed: (burrowed: boolean) => void
  readonly detonate: () => void
  readonly random: () => number
}

interface AttackRuntime {
  readonly attack: EnemyAttackDefinition
  readonly targetId: string
  readonly targetPosition: THREE.Vector3
  readonly target: Damageable
  phase: EnemyAttackPhase
  remaining: number
  nextTickIn: number
  burstsRemaining: number
  hitApplied: boolean
  phaseElapsed: number
  travelRemaining: number
}

export class ExperimentalAttackController {
  private readonly attacks: readonly EnemyAttackDefinition[]
  private readonly source: CombatSource
  private readonly onPhase: (attack: EnemyAttackDefinition | null, phase: EnemyAttackPhase | null, progress: number, targetPosition: THREE.Vector3) => void
  private readonly cooldowns = new Map<string, number>()
  private current: AttackRuntime | null = null

  constructor(
    attacks: readonly EnemyAttackDefinition[],
    source: CombatSource,
    onPhase: (attack: EnemyAttackDefinition | null, phase: EnemyAttackPhase | null, progress: number, targetPosition: THREE.Vector3) => void,
  ) {
    this.attacks = attacks
    this.source = source
    this.onPhase = onPhase
    for (const attack of attacks) {
      validateAttack(attack)
      this.cooldowns.set(attack.id, 0)
    }
  }

  get phaseState(): EnemyAttackPhaseState | null {
    const runtime = this.current
    if (!runtime) return null
    const duration = phaseDuration(runtime.attack, runtime.phase)
    return {
      attackId: runtime.attack.id,
      phase: runtime.phase,
      progress: duration > 0 ? THREE.MathUtils.clamp(1 - runtime.remaining / duration, 0, 1) : 1,
      remainingSeconds: runtime.remaining,
    }
  }

  get lockedTargetPosition(): THREE.Vector3 | null {
    return this.current?.targetPosition.clone() ?? null
  }

  update(deltaTime: number, canAttack: boolean, distance: number, context: ExperimentalEnemyAttackContext): string | null {
    const elapsed = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0
    this.lastContext = context
    this.advanceCooldowns(elapsed, context.position)
    if (this.current) {
      if (this.current.phase === 'windup' && !this.validLockedTarget(canAttack, distance, context)) {
        this.cancelWindup()
        return null
      }
      this.advanceCurrent(elapsed, context)
      return null
    }
    if (!canAttack) return null
    const available = this.attacks
      .filter((attack) => (this.cooldowns.get(attack.id) ?? 0) <= 0 && distance >= attack.minRange && distance <= attack.maxRange)
      .sort((first, second) => second.priority - first.priority || first.id.localeCompare(second.id))
    const attack = available[0]
    if (!attack) return null
    const targetBounds = context.target.getCombatBounds()
    const runtime: AttackRuntime = {
      attack,
      targetId: context.target.combatId,
      target: context.target,
      targetPosition: new THREE.Vector3(targetBounds.x, 0, targetBounds.z),
      phase: 'windup',
      remaining: attack.windupSeconds ?? 0,
      nextTickIn: 0,
      burstsRemaining: 0,
      hitApplied: false,
      phaseElapsed: 0,
      travelRemaining: patternDistance(attack.pattern),
    }
    this.current = runtime
    this.notify(context.position)
    if (runtime.remaining <= 0) this.enterActive(context)
    return attack.id
  }

  cancel(): void {
    const runtime = this.current
    if (runtime?.attack.pattern?.kind === 'burrow') this.lastContext?.setBurrowed(false)
    if (runtime) this.onPhase(null, null, 0, runtime.targetPosition)
    this.current = null
    for (const attack of this.attacks) this.cooldowns.set(attack.id, 0)
  }

  dispose(): void {
    this.cancel()
  }

  private lastContext: ExperimentalEnemyAttackContext | null = null

  private advanceCurrent(deltaTime: number, context: ExperimentalEnemyAttackContext): void {
    const runtime = this.current
    if (!runtime) return
    this.lastContext = context
    if (runtime.phase === 'cooldown') return
    if (runtime.phase === 'active') this.updatePattern(deltaTime, context)
    const previous = runtime.remaining
    runtime.remaining = Math.max(0, runtime.remaining - deltaTime)
    runtime.phaseElapsed += Math.max(0, previous - runtime.remaining)
    if (runtime.remaining > 1e-8) {
      this.notify(context.position)
      return
    }
    if (runtime.phase === 'windup') this.enterActive(context)
    else if (runtime.phase === 'active') this.enterRecovery(context)
    else if (runtime.phase === 'recovery') this.enterCooldown(context)
    else this.finish(context.position)
  }

  private enterActive(context: ExperimentalEnemyAttackContext): void {
    const runtime = this.current
    if (!runtime) return
    runtime.phase = 'active'
    runtime.remaining = runtime.attack.activeSeconds ?? 0.1
    runtime.phaseElapsed = 0
    runtime.nextTickIn = 0
    runtime.hitApplied = false
    const pattern = runtime.attack.pattern
    if (pattern?.kind === 'burrow') context.setBurrowed(true)
    else this.executeStartPattern(context)
    if (pattern?.kind === 'fan' || pattern?.kind === 'radial') {
      const burstCount = runtime.attack.burstCount ?? 1
      this.firePatternProjectiles(context)
      runtime.burstsRemaining = Math.max(0, burstCount - 1)
      runtime.nextTickIn = Math.max(0.08, runtime.attack.burstIntervalSeconds ?? runtime.remaining)
    }
    this.notify(context.position)
    if (runtime.remaining <= 1e-8) this.enterRecovery(context)
  }

  private updatePattern(deltaTime: number, context: ExperimentalEnemyAttackContext): void {
    const runtime = this.current
    if (!runtime) return
    const pattern = runtime.attack.pattern
    if (!pattern) return
    if (pattern.kind === 'fan' || pattern.kind === 'radial') {
      runtime.nextTickIn -= deltaTime
      if (runtime.burstsRemaining > 0 && runtime.nextTickIn <= 0 && runtime.remaining > 0) {
        this.firePatternProjectiles(context)
        runtime.burstsRemaining--
        runtime.nextTickIn += Math.max(0.08, runtime.attack.burstIntervalSeconds ?? runtime.remaining)
      }
      return
    }
    if (pattern.kind === 'charge') {
      const travelled = this.moveTowardLockedTarget(deltaTime, pattern.speed, context)
      runtime.travelRemaining = Math.max(0, runtime.travelRemaining - travelled)
      this.trySingleHit(pattern.collisionRadius, context)
      return
    }
    if (pattern.kind === 'leap') {
      if (!runtime.hitApplied) {
        const direction = runtime.targetPosition.clone().sub(context.position).setY(0)
        if (direction.lengthSq() > 1e-8) context.move(direction.normalize(), Math.min(pattern.maxDistance, context.position.distanceTo(runtime.targetPosition)))
        const radius = pattern.landingRadius
        context.hazards.createZone({
          ownerId: this.source.id,
          center: context.position.clone(),
          radius,
          warningSeconds: 0.18,
          activeSeconds: 0.24,
          tickIntervalSeconds: 0.24,
          damage: runtime.attack.damage,
          damageType: runtime.attack.damageType,
          statusEffects: runtime.attack.statusEffects,
          color: runtime.attack.telegraph?.color ?? '#f5ae45',
        })
        runtime.hitApplied = true
      }
      return
    }
    if (pattern.kind === 'burrow') {
      const travel = Math.min(pattern.travelDistance * deltaTime / Math.max(0.05, runtime.attack.activeSeconds ?? 1), runtime.travelRemaining)
      if (travel > 0) {
        const travelled = this.moveTowardLockedTarget(deltaTime, travel / Math.max(deltaTime, 1e-6), context)
        runtime.travelRemaining = Math.max(0, runtime.travelRemaining - travelled)
      }
      return
    }
    if (pattern.kind === 'cone' || pattern.kind === 'line') {
      runtime.nextTickIn -= deltaTime
      const interval = pattern.kind === 'cone' ? pattern.tickIntervalSeconds : Math.max(0.2, runtime.attack.activeSeconds ?? 0.2)
      if (runtime.nextTickIn <= 0 && !runtime.hitApplied) {
        this.applyAreaPattern(context)
        runtime.hitApplied = true
        runtime.nextTickIn = interval
      } else if (pattern.kind === 'cone' && runtime.nextTickIn <= 0) {
        this.applyAreaPattern(context)
        runtime.nextTickIn += interval
      }
    }
  }

  private executeStartPattern(context: ExperimentalEnemyAttackContext): void {
    const runtime = this.current
    if (!runtime) return
    const pattern = runtime.attack.pattern
    if (!pattern) {
      this.executeDirect(context)
      return
    }
    if (pattern.kind === 'direct') {
      this.executeDirect(context)
    } else if (pattern.kind === 'lobbed-zone') {
      if (runtime.attack.projectile) {
        const origin = context.position.clone().add(new THREE.Vector3(0, context.enemyHeight, 0))
        context.combat.spawnArcVisual(runtime.attack.projectile, this.source, origin, runtime.targetPosition, pattern.delaySeconds, pattern.apexHeight)
      }
      context.hazards.createZone({
        ownerId: this.source.id,
        center: runtime.targetPosition,
        radius: pattern.radius,
        warningSeconds: pattern.delaySeconds,
        activeSeconds: pattern.activeSeconds,
        tickIntervalSeconds: pattern.tickIntervalSeconds,
        damage: runtime.attack.damage,
        damageType: runtime.attack.damageType,
        statusEffects: runtime.attack.statusEffects,
        color: runtime.attack.telegraph?.color ?? '#f3a448',
      })
    } else if (pattern.kind === 'multi-zone') {
      for (let index = 0; index < pattern.zoneCount; index++) {
        const angle = index * Math.PI * 2 / pattern.zoneCount + context.random() * 0.12
        const center = runtime.targetPosition.clone().add(new THREE.Vector3(Math.cos(angle) * pattern.spreadDistance, 0, Math.sin(angle) * pattern.spreadDistance))
        context.hazards.createZone({
          ownerId: this.source.id,
          center,
          radius: pattern.radius,
          warningSeconds: pattern.delaySeconds,
          activeSeconds: pattern.activeSeconds,
          tickIntervalSeconds: pattern.tickIntervalSeconds,
          damage: runtime.attack.damage,
          damageType: runtime.attack.damageType,
          statusEffects: runtime.attack.statusEffects,
          color: runtime.attack.telegraph?.color ?? '#f3a448',
        })
      }
      runtime.hitApplied = true
    } else if (pattern.kind === 'arc-nodes') {
      const forward = runtime.targetPosition.clone().sub(context.position).setY(0)
      if (forward.lengthSq() > 1e-8) {
        forward.normalize()
        const perpendicular = new THREE.Vector3(-forward.z, 0, forward.x)
        const midpoint = context.position.clone().lerp(runtime.targetPosition, 0.55)
        const halfLength = Math.min(pattern.nodeRange * 0.45, context.position.distanceTo(runtime.targetPosition) * 0.3)
        context.hazards.createArcLink({
          ownerId: this.source.id,
          start: midpoint.clone().addScaledVector(perpendicular, -halfLength),
          end: midpoint.clone().addScaledVector(perpendicular, halfLength),
          warningSeconds: runtime.attack.windupSeconds ?? 0,
          activeSeconds: pattern.activeSeconds,
          tickIntervalSeconds: pattern.tickIntervalSeconds,
          width: pattern.linkWidth,
          damage: runtime.attack.damage,
          damageType: runtime.attack.damageType,
          statusEffects: runtime.attack.statusEffects,
          color: runtime.attack.telegraph?.color ?? '#59e3ff',
          nodeHealth: 28,
        })
      }
      runtime.hitApplied = true
    } else if (pattern.kind === 'suicide') {
      runtime.remaining = Math.max(0.05, pattern.fuseSeconds)
    } else if (pattern.kind === 'projectile-explosion') {
      this.fireProjectile(context, {
        kind: 'projectile-explosion',
        radius: pattern.radius,
        damageMultiplier: pattern.damageMultiplier,
      })
      runtime.hitApplied = true
    }
  }

  private executeDirect(context: ExperimentalEnemyAttackContext): void {
    const runtime = this.current
    if (!runtime) return
    if (runtime.attack.type === 'projectile') this.fireProjectile(context)
    else if (runtime.attack.type === 'melee') this.applyToTarget(context, runtime.target, runtime.attack.damage)
    runtime.hitApplied = true
  }

  private firePatternProjectiles(context: ExperimentalEnemyAttackContext): void {
    const runtime = this.current
    if (!runtime) return
    const pattern = runtime.attack.pattern
    if (!pattern || (pattern.kind !== 'fan' && pattern.kind !== 'radial')) return
    const projectile = runtime.attack.projectile
    if (!projectile) return
    const origin = context.position.clone().add(new THREE.Vector3(0, context.enemyHeight ?? 1, 0))
    const count = pattern.kind === 'radial' ? pattern.projectileCount : pattern.projectileCount
    const direction = runtime.targetPosition.clone().sub(context.position).setY(0)
    if (direction.lengthSq() < 1e-8) direction.set(Math.sin(context.orientation), 0, Math.cos(context.orientation))
    direction.normalize()
    for (let index = 0; index < count; index++) {
      let shot = direction.clone()
      if (pattern.kind === 'radial') shot.set(Math.cos(index * Math.PI * 2 / count), 0, Math.sin(index * Math.PI * 2 / count))
      else if (count > 1) {
        const angle = -pattern.spreadRadians / 2 + pattern.spreadRadians * index / (count - 1)
        shot.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
      }
      context.combat.spawnProjectile(projectile, this.source, origin, shot)
    }
  }

  private fireProjectile(context: ExperimentalEnemyAttackContext, explosion?: Extract<EnemyAttackPattern, { kind: 'projectile-explosion' }>): void {
    const runtime = this.current
    const projectile = runtime?.attack.projectile
    if (!runtime || !projectile) return
    const origin = context.position.clone().add(new THREE.Vector3(0, context.enemyHeight ?? 1, 0))
    const direction = runtime.targetPosition.clone().sub(context.position).setY(0)
    if (direction.lengthSq() < 1e-8) direction.set(Math.sin(context.orientation), 0, Math.cos(context.orientation))
    const definition = explosion ? {
      ...projectile,
      onImpact: {
        ...projectile.onImpact,
        splash: { radius: explosion.radius, damageMultiplier: explosion.damageMultiplier, maxTargets: 8 },
      },
    } : projectile
    context.combat.spawnProjectile(definition, this.source, origin, direction.normalize())
  }

  private applyAreaPattern(context: ExperimentalEnemyAttackContext): void {
    const runtime = this.current
    const pattern = runtime?.attack.pattern
    if (!runtime || !pattern || (pattern.kind !== 'cone' && pattern.kind !== 'line')) return
    const direction = runtime.targetPosition.clone().sub(context.position).setY(0)
    if (direction.lengthSq() < 1e-8) return
    direction.normalize()
    const end = context.position.clone().addScaledVector(direction, pattern.kind === 'cone' ? pattern.range : pattern.range)
    for (const target of context.targets) {
      if (!isAlive(target)) continue
      const bounds = target.getCombatBounds()
      const toTarget = new THREE.Vector3(bounds.x - context.position.x, 0, bounds.z - context.position.z)
      const distance = toTarget.length()
      if (distance > pattern.range + bounds.radius || !hasLineOfSight(context.position, new THREE.Vector3(bounds.x, 0, bounds.z), context.obstacles)) continue
      if (pattern.kind === 'cone') {
        const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(toTarget.normalize()), -1, 1))
        if (angle > pattern.angleRadians / 2) continue
      } else if (distanceToSegment(bounds.x, bounds.z, context.position.x, context.position.z, end.x, end.z) > pattern.width + bounds.radius) continue
      this.applyToTarget(context, target, runtime.attack.damage)
    }
  }

  private moveTowardLockedTarget(deltaTime: number, speed: number, context: ExperimentalEnemyAttackContext): number {
    const runtime = this.current
    if (!runtime || runtime.travelRemaining <= 0) return 0
    const direction = runtime.targetPosition.clone().sub(context.position).setY(0)
    if (direction.lengthSq() < 1e-8) return 0
    const travelled = Math.min(runtime.travelRemaining, speed * deltaTime)
    return travelled > 0 ? context.move(direction.normalize(), travelled) : 0
  }

  private trySingleHit(extraRadius: number, context: ExperimentalEnemyAttackContext): void {
    const runtime = this.current
    if (!runtime || runtime.hitApplied) return
    const bounds = runtime.target.getCombatBounds()
    const distance = Math.hypot(context.position.x - bounds.x, context.position.z - bounds.z)
    if (!isAlive(runtime.target) || distance > context.collisionRadius + bounds.radius + extraRadius) return
    this.applyToTarget(context, runtime.target, runtime.attack.damage)
    runtime.hitApplied = true
  }

  private applyToTarget(context: ExperimentalEnemyAttackContext, target: Damageable, amount: number): void {
    const runtime = this.current
    if (!runtime || !isAlive(target)) return
    context.combat.applyDamage(target, {
      sourceId: this.source.id,
      sourceFaction: this.source.faction,
      amount,
      type: runtime.attack.damageType,
      effects: runtime.attack.statusEffects,
      sourcePosition: [context.position.x, context.enemyHeight ?? 1, context.position.z],
    })
  }

  private validLockedTarget(canAttack: boolean, distance: number, context: ExperimentalEnemyAttackContext): boolean {
    const runtime = this.current
    return Boolean(runtime && canAttack && context.target.combatId === runtime.targetId && isAlive(runtime.target)
      && distance >= runtime.attack.minRange && distance <= runtime.attack.maxRange)
  }

  private enterRecovery(context: ExperimentalEnemyAttackContext): void {
    const runtime = this.current
    if (!runtime) return
    if (runtime.attack.pattern?.kind === 'burrow') {
      const pattern = runtime.attack.pattern
      context.setBurrowed(false)
      context.hazards.createZone({
        ownerId: this.source.id,
        center: context.position.clone(),
        radius: pattern.emergeRadius,
        warningSeconds: pattern.emergeDelaySeconds,
        activeSeconds: 0.24,
        tickIntervalSeconds: 0.24,
        damage: runtime.attack.damage,
        damageType: runtime.attack.damageType,
        statusEffects: runtime.attack.statusEffects,
        color: runtime.attack.telegraph?.color ?? '#70e4d7',
      })
    }
    if (runtime.attack.pattern?.kind === 'suicide' && runtime.remaining <= 1e-8) {
      context.hazards.createZone({
        ownerId: this.source.id,
        center: context.position.clone(),
        radius: runtime.attack.pattern.radius,
        warningSeconds: 0,
        activeSeconds: 0.24,
        tickIntervalSeconds: 0.24,
        damage: runtime.attack.damage,
        damageType: runtime.attack.damageType,
        statusEffects: runtime.attack.statusEffects,
        color: runtime.attack.telegraph?.color ?? '#f0704f',
        persistAfterOwnerDeath: true,
      })
      if (runtime.attack.pattern.fireZoneSeconds > 0) context.hazards.createZone({
        ownerId: this.source.id,
        center: context.position.clone(),
        radius: runtime.attack.pattern.radius * 0.75,
        warningSeconds: 0,
        activeSeconds: runtime.attack.pattern.fireZoneSeconds,
        tickIntervalSeconds: 0.6,
        damage: runtime.attack.damage * 0.22,
        damageType: 'fire',
        statusEffects: runtime.attack.statusEffects,
        color: '#f07442',
        persistAfterOwnerDeath: true,
      })
      context.detonate()
      return
    }
    runtime.phase = 'recovery'
    runtime.remaining = runtime.attack.recoverySeconds ?? 0.4
    runtime.phaseElapsed = 0
    this.notify(context.position)
    if (runtime.remaining <= 1e-8) this.enterCooldown(context)
  }

  private enterCooldown(context: ExperimentalEnemyAttackContext): void {
    const runtime = this.current
    if (!runtime) return
    runtime.phase = 'cooldown'
    runtime.remaining = runtime.attack.cooldownSeconds
    this.cooldowns.set(runtime.attack.id, runtime.attack.cooldownSeconds)
    this.notify(context.position)
    if (runtime.remaining <= 1e-8) this.finish(context.position)
  }

  private cancelWindup(): void {
    const runtime = this.current
    if (!runtime) return
    this.cooldowns.set(runtime.attack.id, Math.min(1, runtime.attack.cooldownSeconds * 0.35))
    if (runtime.attack.pattern?.kind === 'burrow') this.lastContext?.setBurrowed(false)
    this.onPhase(runtime.attack, null, 0, runtime.targetPosition)
    this.current = null
  }

  private advanceCooldowns(deltaTime: number, position: THREE.Vector3): void {
    for (const [id, remaining] of this.cooldowns) this.cooldowns.set(id, Math.max(0, remaining - deltaTime))
    if (this.current?.phase === 'cooldown') {
      this.current.remaining = this.cooldowns.get(this.current.attack.id) ?? 0
      if (this.current.remaining <= 1e-8) this.finish(position)
    }
  }

  private notify(_position?: THREE.Vector3): void {
    const runtime = this.current
    if (!runtime) return
    const duration = phaseDuration(runtime.attack, runtime.phase)
    this.onPhase(runtime.attack, runtime.phase, duration > 0 ? 1 - runtime.remaining / duration : 1, runtime.targetPosition)
  }

  private finish(_position: THREE.Vector3): void {
    const runtime = this.current
    if (!runtime) return
    this.onPhase(runtime.attack, null, 0, runtime.targetPosition)
    this.current = null
  }
}

function phaseDuration(attack: EnemyAttackDefinition, phase: EnemyAttackPhase): number {
  if (phase === 'windup') return attack.windupSeconds ?? 0
  if (phase === 'active') return attack.activeSeconds ?? 0.1
  if (phase === 'recovery') return attack.recoverySeconds ?? 0.4
  return attack.cooldownSeconds
}

function patternDistance(pattern: EnemyAttackPattern | undefined): number {
  if (!pattern) return 0
  if (pattern.kind === 'charge') return pattern.maxDistance
  if (pattern.kind === 'burrow') return pattern.travelDistance
  if (pattern.kind === 'leap') return pattern.maxDistance
  return 0
}

function isAlive(target: Damageable): boolean {
  if ('isAlive' in target && typeof target.isAlive === 'boolean') return target.isAlive
  if ('isDead' in target && typeof target.isDead === 'boolean') return !target.isDead
  if ('currentHealth' in target && typeof target.currentHealth === 'number') return target.currentHealth > 0
  return true
}

function validateAttack(attack: EnemyAttackDefinition): void {
  if (!attack.id || !attack.pattern) throw new Error(`Experimental attack ${attack.id} requires a pattern`)
  if (attack.type === 'projectile' && !attack.projectile) throw new Error(`Experimental projectile ${attack.id} requires a projectile definition`)
  for (const [field, value] of [
    ['minRange', attack.minRange], ['maxRange', attack.maxRange], ['cooldown', attack.cooldownSeconds],
    ['damage', attack.damage], ['windup', attack.windupSeconds ?? 0],
    ['active', attack.activeSeconds ?? 0.1], ['recovery', attack.recoverySeconds ?? 0.4],
  ] as const) if (!Number.isFinite(value) || value < 0) throw new RangeError(`Experimental attack ${attack.id} has invalid ${field}`)
  if (attack.maxRange < attack.minRange || !attack.telegraph) throw new RangeError(`Experimental attack ${attack.id} has invalid range or missing telegraph`)
  const burstCount = attack.burstCount ?? 1
  const burstInterval = attack.burstIntervalSeconds ?? attack.activeSeconds ?? 0.1
  if (!Number.isSafeInteger(burstCount) || burstCount < 1 || burstCount > 8
    || !Number.isFinite(burstInterval) || burstInterval < 0
    || burstCount > 1 && ((attack.activeSeconds ?? 0.1) < (burstCount - 1) * burstInterval || burstInterval < 0.08)) {
    throw new RangeError(`Experimental attack ${attack.id} has an invalid or truncated burst`)
  }
  const statuses = [...(attack.statusEffects ?? []), ...(attack.projectile?.statusEffects ?? [])]
  for (const effect of statuses) {
    if (effect.type === 'burn' && (effect.durationSeconds <= 0 || effect.durationSeconds > 8 || effect.damagePerSecond <= 0 || effect.damagePerSecond > 18
      || (effect.tickIntervalSeconds !== undefined && (effect.tickIntervalSeconds < 0.2 || effect.tickIntervalSeconds > 1)))) throw new RangeError(`Experimental attack ${attack.id} has invalid burn settings`)
    if (effect.type === 'slow' && (effect.durationSeconds <= 0 || effect.durationSeconds > 8 || effect.movementMultiplier < 0.45 || effect.movementMultiplier > 1)) throw new RangeError(`Experimental attack ${attack.id} has invalid slow settings`)
    if (effect.type === 'shock' && (effect.staggerSeconds <= 0 || effect.staggerSeconds > 0.35)) throw new RangeError(`Experimental attack ${attack.id} has invalid shock settings`)
  }
  const pattern = attack.pattern
  for (const [key, value] of Object.entries(pattern)) {
    if (key !== 'kind' && (!Number.isFinite(value) || (value as number) < 0)) throw new RangeError(`Experimental attack ${attack.id} has invalid pattern value ${key}`)
  }
  if (pattern.kind === 'fan' && (!Number.isSafeInteger(pattern.projectileCount) || pattern.projectileCount < 2 || pattern.projectileCount > 16 || pattern.spreadRadians <= 0 || pattern.spreadRadians > Math.PI)) throw new RangeError(`Experimental fan ${attack.id} is invalid`)
  if (pattern.kind === 'radial' && (!Number.isSafeInteger(pattern.projectileCount) || pattern.projectileCount < 4 || pattern.projectileCount > 20)) throw new RangeError(`Experimental radial ${attack.id} is invalid`)
  if (pattern.kind === 'cone' && (pattern.range <= 0 || pattern.range > 30 || pattern.angleRadians <= 0 || pattern.angleRadians > Math.PI || pattern.tickIntervalSeconds < 0.12)) throw new RangeError(`Experimental cone ${attack.id} is invalid`)
  if (pattern.kind === 'line' && (pattern.range <= 0 || pattern.range > 30 || pattern.width <= 0 || pattern.width > 2)) throw new RangeError(`Experimental line ${attack.id} is invalid`)
  if (pattern.kind === 'charge' && (pattern.speed <= 0 || pattern.speed > 12 || pattern.maxDistance <= 0 || pattern.maxDistance > 16 || pattern.collisionRadius <= 0 || pattern.collisionRadius > 2)) throw new RangeError(`Experimental charge ${attack.id} is invalid`)
  if (pattern.kind === 'lobbed-zone' && (pattern.radius <= 0 || pattern.radius > 8 || pattern.delaySeconds < 0.3 || pattern.activeSeconds <= 0 || pattern.activeSeconds > 8 || pattern.tickIntervalSeconds < 0.12 || pattern.apexHeight <= 0 || pattern.apexHeight > 8)) throw new RangeError(`Experimental lobbed zone ${attack.id} is invalid`)
  if (pattern.kind === 'multi-zone' && (!Number.isSafeInteger(pattern.zoneCount) || pattern.zoneCount < 2 || pattern.zoneCount > 5 || pattern.radius <= 0 || pattern.radius > 4 || pattern.spreadDistance < pattern.radius * 1.5 || pattern.delaySeconds < 0.3 || pattern.activeSeconds <= 0 || pattern.tickIntervalSeconds < 0.12)) throw new RangeError(`Experimental zones ${attack.id} are invalid`)
  if (pattern.kind === 'arc-nodes' && (pattern.nodeRange < 2 || pattern.nodeRange > 16 || pattern.linkWidth <= 0 || pattern.linkWidth > 1 || pattern.activeSeconds <= 0 || pattern.tickIntervalSeconds < 0.12)) throw new RangeError(`Experimental arc ${attack.id} is invalid`)
  if (pattern.kind === 'leap' && (pattern.maxDistance <= 0 || pattern.maxDistance > 8 || pattern.landingRadius <= 0 || pattern.landingRadius > 5)) throw new RangeError(`Experimental leap ${attack.id} is invalid`)
  if (pattern.kind === 'suicide' && (pattern.fuseSeconds < 0.6 || pattern.fuseSeconds > 5 || pattern.radius <= 0 || pattern.radius > 6 || pattern.fireZoneSeconds < 0 || pattern.fireZoneSeconds > 5)) throw new RangeError(`Experimental fuse ${attack.id} is invalid`)
  if (pattern.kind === 'burrow' && (pattern.travelDistance <= 0 || pattern.travelDistance > 9 || pattern.emergeRadius <= 0 || pattern.emergeRadius > 5 || pattern.emergeDelaySeconds < 0.25 || pattern.emergeDelaySeconds > 2)) throw new RangeError(`Experimental burrow ${attack.id} is invalid`)
  if (pattern.kind === 'projectile-explosion' && (pattern.radius <= 0 || pattern.radius > 6 || pattern.damageMultiplier < 0 || pattern.damageMultiplier > 2)) throw new RangeError(`Experimental explosion ${attack.id} is invalid`)
}

function distanceToSegment(x: number, z: number, startX: number, startZ: number, endX: number, endZ: number): number {
  const dx = endX - startX
  const dz = endZ - startZ
  const lengthSquared = dx * dx + dz * dz
  const amount = lengthSquared === 0 ? 0 : THREE.MathUtils.clamp(((x - startX) * dx + (z - startZ) * dz) / lengthSquared, 0, 1)
  return Math.hypot(x - (startX + dx * amount), z - (startZ + dz * amount))
}
