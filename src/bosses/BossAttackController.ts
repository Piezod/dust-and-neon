import * as THREE from 'three'
import type { CombatSystem } from '../combat/CombatSystem'
import type { CombatSource, DamageContext } from '../combat/Combat.types'
import type { Damageable } from '../combat/Damageable'
import type { EnemyHazardManager } from '../enemies/EnemyHazardManager'
import type { BossAttackDefinition, BossAttackPhase, BossAttackRuntimeState, BossSequenceStep } from './Boss.types'

export interface BossAttackContext {
  readonly bossPosition: THREE.Vector3
  readonly bossRadius: number
  readonly bossSpeed: number
  readonly player: Damageable
  readonly combat: CombatSystem
  readonly obstacles: readonly THREE.Box2[]
  readonly hazards: EnemyHazardManager
  readonly summon: (enemyId: string, count: number) => void
  readonly moveBoss: (direction: THREE.Vector3, distance: number) => void
  readonly random: () => number
}

interface AttackRuntime {
  readonly attack: BossAttackDefinition
  phase: BossAttackPhase
  remaining: number
  nextBurstIn: number
  burstsRemaining: number
  sequenceIndex: number
  sequenceTimer: number
  hitApplied: boolean
  readonly targetPosition: THREE.Vector3
}

const EPSILON = 1e-8
const FULL_CIRCLE = Math.PI * 2

export class BossAttackController {
  private readonly attacks: readonly BossAttackDefinition[]
  private readonly source: CombatSource
  private readonly cooldowns = new Map<string, number>()
  private readonly onPhase: (attack: BossAttackDefinition, phase: BossAttackPhase | null, progress: number, target: THREE.Vector3) => void
  private current: AttackRuntime | null = null

  constructor(
    attacks: readonly BossAttackDefinition[],
    source: CombatSource,
    onPhase: (attack: BossAttackDefinition, phase: BossAttackPhase | null, progress: number, target: THREE.Vector3) => void,
  ) {
    this.attacks = attacks
    this.source = source
    this.onPhase = onPhase
    for (const attack of attacks) {
      this.validateAttack(attack)
      this.cooldowns.set(attack.id, 0)
    }
  }

  get phase(): BossAttackPhase | null {
    return this.current?.phase ?? null
  }

  get state(): BossAttackRuntimeState | null {
    const runtime = this.current
    if (!runtime) return null
    const duration = this.duration(runtime.attack, runtime.phase)
    return {
      attackId: runtime.attack.id,
      phase: runtime.phase,
      progress: duration > 0 ? THREE.MathUtils.clamp(1 - runtime.remaining / duration, 0, 1) : 1,
      telegraph: runtime.attack.telegraph,
      targetPosition: [runtime.targetPosition.x, runtime.targetPosition.y, runtime.targetPosition.z],
    }
  }

  update(deltaTime: number, phaseAttackIds: readonly string[], context: BossAttackContext): void {
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    this.advanceCooldowns(elapsed)
    if (!this.current) {
      this.beginNext(phaseAttackIds, context)
      return
    }
    this.advanceCurrent(elapsed, context)
  }

  cancel(): void {
    if (this.current) this.setPhase(null)
    for (const id of this.cooldowns.keys()) this.cooldowns.set(id, 0)
  }

  dispose(): void {
    this.cancel()
  }

  private beginNext(phaseAttackIds: readonly string[], context: BossAttackContext): void {
    const distance = this.distance(context.bossPosition, context.player.getCombatBounds())
    const available = this.attacks.filter((attack) =>
      phaseAttackIds.includes(attack.id)
      && this.cooldowns.get(attack.id) === 0
      && distance >= attack.minRange
      && distance <= attack.maxRange
      && this.hasLineOfSight(attack, context),
    )
    if (available.length === 0) return
    const priority = Math.max(...available.map((attack) => attack.priority))
    const candidates = available.filter((attack) => attack.priority === priority)
    const attack = this.pickWeighted(candidates, context.random)
    const targetBounds = context.player.getCombatBounds()
    const targetPosition = new THREE.Vector3(targetBounds.x, 0, targetBounds.z)
    this.current = {
      attack,
      phase: 'windup',
      remaining: attack.windupSeconds,
      nextBurstIn: 0,
      burstsRemaining: 0,
      sequenceIndex: 0,
      sequenceTimer: 0,
      hitApplied: false,
      targetPosition,
    }
    this.notify()
    if (attack.windupSeconds <= 0) this.enterActive(context)
  }

  private advanceCurrent(deltaTime: number, context: BossAttackContext): void {
    let remainingFrame = deltaTime
    let transitions = 0
    while (this.current && transitions < 8) {
      const runtime = this.current
      if (runtime.phase === 'windup' && !this.hasLineOfSight(runtime.attack, context)) return
      if (runtime.phase === 'active' && runtime.attack.pattern === 'charge') {
        const step = Math.min(remainingFrame, runtime.remaining)
        const direction = runtime.targetPosition.clone().sub(context.bossPosition).setY(0)
        if (direction.lengthSq() > EPSILON) context.moveBoss(direction.normalize(), context.bossSpeed * step)
        const player = context.player.getCombatBounds()
        if (!runtime.hitApplied && this.distance(context.bossPosition, player) <= context.bossRadius + player.radius + (runtime.attack.radius ?? 0.3)) {
          this.applyDamage(context, runtime.attack)
        }
        runtime.remaining -= step
        remainingFrame -= step
        if (runtime.remaining > EPSILON && remainingFrame <= EPSILON) return
      } else if (runtime.phase === 'active') {
        if (runtime.attack.pattern === 'sequence') {
          this.advanceSequence(runtime, remainingFrame, context)
        } else if (runtime.attack.pattern === 'burst' && runtime.burstsRemaining > 0) {
          const step = Math.min(remainingFrame, runtime.remaining, runtime.nextBurstIn)
          runtime.remaining -= step
          runtime.nextBurstIn -= step
          remainingFrame -= step
          if (runtime.nextBurstIn <= EPSILON && runtime.burstsRemaining > 0 && runtime.remaining > EPSILON) {
            this.executePattern(runtime.attack, context, runtime.targetPosition)
            runtime.burstsRemaining--
            runtime.nextBurstIn = Math.max(EPSILON, runtime.attack.burstIntervalSeconds ?? 0.1)
            continue
          }
          if (runtime.remaining > EPSILON && remainingFrame <= EPSILON) return
        } else {
          const step = Math.min(remainingFrame, runtime.remaining)
          runtime.remaining -= step
          remainingFrame -= step
          if (runtime.remaining > EPSILON && remainingFrame <= EPSILON) return
        }
      } else {
        const step = Math.min(remainingFrame, runtime.remaining)
        runtime.remaining -= step
        remainingFrame -= step
        if (runtime.remaining > EPSILON && remainingFrame <= EPSILON) return
      }
      if (runtime.remaining > EPSILON) return
      transitions++
      if (runtime.phase === 'windup') this.enterActive(context)
      else if (runtime.phase === 'active') this.enterRecovery()
      else if (runtime.phase === 'recovery') this.enterCooldown()
      else return
      if (remainingFrame <= EPSILON && this.current?.phase !== 'active') return
    }
  }

  private advanceSequence(runtime: AttackRuntime, elapsed: number, context: BossAttackContext): void {
    if (!runtime.attack.sequence || runtime.attack.sequence.length === 0) return
    runtime.sequenceTimer += elapsed
    while (runtime.sequenceIndex + 1 < runtime.attack.sequence.length
      && runtime.sequenceTimer >= runtime.attack.sequence[runtime.sequenceIndex + 1].delaySeconds) {
      runtime.sequenceIndex++
      const step = runtime.attack.sequence[runtime.sequenceIndex]
      this.executeSequenceStep(step, runtime.targetPosition, context, runtime.attack)
    }
    runtime.remaining = Math.max(0, runtime.attack.activeSeconds - runtime.sequenceTimer)
  }

  private executeSequenceStep(step: BossSequenceStep, target: THREE.Vector3, context: BossAttackContext, attack: BossAttackDefinition): void {
    this.executePattern({ ...attack, pattern: step.pattern, projectileCount: step.projectileCount ?? attack.projectileCount, spreadRadians: step.spreadRadians ?? attack.spreadRadians, radius: step.radius ?? attack.radius }, context, target)
  }

  private enterActive(context: BossAttackContext): void {
    const runtime = this.current
    if (!runtime) return
    runtime.phase = 'active'
    runtime.remaining = runtime.attack.activeSeconds
    runtime.hitApplied = false
    if (runtime.attack.pattern === 'burst') {
      this.executePattern(runtime.attack, context, runtime.targetPosition)
      runtime.burstsRemaining = Math.max(0, (runtime.attack.burstCount ?? 1) - 1)
      runtime.nextBurstIn = runtime.attack.burstIntervalSeconds ?? runtime.attack.activeSeconds
    } else if (runtime.attack.pattern === 'sequence') {
      runtime.sequenceIndex = 0
      runtime.sequenceTimer = 0
      this.executeSequenceStep(runtime.attack.sequence![0], runtime.targetPosition, context, runtime.attack)
    } else {
      this.executePattern(runtime.attack, context, runtime.targetPosition)
    }
    this.notify()
    if (runtime.remaining <= EPSILON) this.enterRecovery()
  }

  private enterRecovery(): void {
    if (!this.current) return
    this.current.phase = 'recovery'
    this.current.remaining = this.current.attack.recoverySeconds
    this.notify()
    if (this.current.remaining <= EPSILON) this.enterCooldown()
  }

  private enterCooldown(): void {
    if (!this.current) return
    const attack = this.current.attack
    this.current.phase = 'cooldown'
    this.current.remaining = attack.cooldownSeconds
    this.cooldowns.set(attack.id, attack.cooldownSeconds)
    this.notify()
    if (attack.cooldownSeconds <= EPSILON) this.setPhase(null)
  }

  private executePattern(attack: BossAttackDefinition, context: BossAttackContext, target: THREE.Vector3): void {
    const boss = context.bossPosition
    const playerBounds = context.player.getCombatBounds()
    if (attack.pattern === 'summon') {
      if (attack.summonEnemyId) context.summon(attack.summonEnemyId, attack.summonCount ?? 1)
      return
    }
    if (attack.pattern === 'arc-nodes') {
      const direction = target.clone().sub(boss).setY(0)
      if (direction.lengthSq() < 1e-8) return
      direction.normalize()
      const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x)
      const midpoint = boss.clone().addScaledVector(direction, Math.min(attack.nodeRange ?? 8, boss.distanceTo(target)) * 0.55)
      const halfLength = Math.min((attack.nodeRange ?? 8) * 0.4, boss.distanceTo(target) * 0.25)
      context.hazards.createArcLink({
        ownerId: this.source.id,
        start: midpoint.clone().addScaledVector(perpendicular, -halfLength),
        end: midpoint.clone().addScaledVector(perpendicular, halfLength),
        warningSeconds: attack.activeSeconds,
        activeSeconds: attack.recoverySeconds + 1.5,
        tickIntervalSeconds: attack.tickIntervalSeconds ?? 0.5,
        width: attack.linkWidth ?? 0.42,
        damage: attack.damage,
        damageType: attack.damageType,
        statusEffects: attack.statusEffects,
        color: '#58dfff',
        nodeHealth: attack.nodeHealth ?? 28,
      })
      return
    }
    if (attack.pattern === 'zone') {
      if (!this.isInRadius(target.x, target.z, playerBounds.x, playerBounds.z, attack.radius ?? 2.2, playerBounds.radius)) return
      this.applyDamage(context, attack)
      return
    }
    if (attack.pattern === 'melee') {
      const range = attack.radius ?? context.bossRadius + playerBounds.radius + 0.3
      if (this.distance(boss, playerBounds) <= range && this.hasLineOfSight(attack, context)) this.applyDamage(context, attack)
      return
    }
    if (attack.pattern === 'charge') {
      return
    }
    if (attack.pattern === 'laser') {
      const endpoint = target.clone()
      if (!this.hasLineOfSight(attack, context)) return
      const reach = this.distanceToSegment(playerBounds.x, playerBounds.z, boss.x, boss.z, endpoint.x, endpoint.z)
      if (reach <= (attack.radius ?? 0.6) + playerBounds.radius) this.applyDamage(context, attack)
      return
    }
    if (attack.pattern === 'aimed' || attack.pattern === 'burst' || attack.pattern === 'fan' || attack.pattern === 'radial') {
      this.fireProjectiles(attack, context, target)
    }
  }

  private fireProjectiles(attack: BossAttackDefinition, context: BossAttackContext, target: THREE.Vector3): void {
    if (!attack.projectile) return
    const origin = context.bossPosition.clone().add(new THREE.Vector3(0, 1.2, 0))
    const count = attack.pattern === 'radial' ? attack.projectileCount ?? 10 : attack.pattern === 'fan' ? attack.projectileCount ?? 5 : 1
    const direction = new THREE.Vector3(target.x - origin.x, 0, target.z - origin.z)
    if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1)
    direction.normalize()
    const spread = attack.spreadRadians ?? Math.PI / 3
    for (let index = 0; index < count; index++) {
      let shotDirection: THREE.Vector3
      if (attack.pattern === 'radial') {
        const angle = index * FULL_CIRCLE / count
        shotDirection = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
      } else if (attack.pattern === 'fan' && count > 1) {
        const angle = -spread / 2 + spread * index / (count - 1)
        shotDirection = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
      } else {
        shotDirection = direction.clone()
      }
      context.combat.spawnProjectile(attack.projectile, this.source, origin, shotDirection)
    }
  }

  private applyDamage(context: BossAttackContext, attack: BossAttackDefinition): void {
    const damage: DamageContext = {
      sourceId: this.source.id,
      sourceFaction: this.source.faction,
      amount: attack.damage,
      type: attack.damageType,
      sourcePosition: [context.bossPosition.x, 1, context.bossPosition.z],
      effects: attack.statusEffects,
    }
    if (this.current && this.current.hitApplied) return
    context.combat.applyDamage(context.player, damage)
    if (this.current) this.current.hitApplied = true
  }

  private hasLineOfSight(attack: BossAttackDefinition, context: BossAttackContext): boolean {
    if (attack.pattern === 'radial' || attack.pattern === 'zone' || attack.pattern === 'summon') return true
    return this.segmentClear(context.bossPosition, context.player.getCombatBounds(), context.obstacles, 0)
  }

  private segmentClear(start: THREE.Vector3, end: THREE.Vector3 | ReturnType<Damageable['getCombatBounds']>, obstacles: readonly THREE.Box2[], padding: number): boolean {
    const targetX = end instanceof THREE.Vector3 ? end.x : end.x
    const targetZ = end instanceof THREE.Vector3 ? end.z : end.z
    const dx = targetX - start.x
    const dz = targetZ - start.z
    for (const obstacle of obstacles) {
      let entry = 0
      let exit = 1
      for (const [origin, delta, minimum, maximum] of [
        [start.x, dx, obstacle.min.x - padding, obstacle.max.x + padding],
        [start.z, dz, obstacle.min.y - padding, obstacle.max.y + padding],
      ]) {
        if (Math.abs(delta) < 1e-10) {
          if (origin < minimum || origin > maximum) { entry = 2; break }
          continue
        }
        const first = (minimum - origin) / delta
        const second = (maximum - origin) / delta
        entry = Math.max(entry, Math.min(first, second))
        exit = Math.min(exit, Math.max(first, second))
        if (entry > exit) { entry = 2; break }
      }
      if (entry <= 1 && exit >= 0) return false
    }
    return true
  }

  private distance(boss: THREE.Vector3, player: ReturnType<Damageable['getCombatBounds']>): number {
    return Math.hypot(boss.x - player.x, boss.z - player.z)
  }

  private isInRadius(centerX: number, centerZ: number, x: number, z: number, radius: number, targetRadius: number): boolean {
    return Math.hypot(centerX - x, centerZ - z) <= radius + targetRadius
  }

  private distanceToSegment(x: number, z: number, startX: number, startZ: number, endX: number, endZ: number): number {
    const dx = endX - startX
    const dz = endZ - startZ
    const lengthSq = dx * dx + dz * dz
    const amount = lengthSq === 0 ? 0 : THREE.MathUtils.clamp(((x - startX) * dx + (z - startZ) * dz) / lengthSq, 0, 1)
    return Math.hypot(x - (startX + dx * amount), z - (startZ + dz * amount))
  }

  private advanceCooldowns(deltaTime: number): void {
    for (const [id, remaining] of this.cooldowns) this.cooldowns.set(id, Math.max(0, remaining - deltaTime))
    if (this.current?.phase === 'cooldown') {
      this.current.remaining = this.cooldowns.get(this.current.attack.id) ?? 0
      if (this.current.remaining <= EPSILON) this.setPhase(null)
    }
  }

  private notify(): void {
    const runtime = this.current
    if (!runtime) return
    const duration = runtime.phase === 'cooldown' ? runtime.attack.cooldownSeconds : runtime.attack[`${runtime.phase}Seconds` as 'windupSeconds' | 'activeSeconds' | 'recoverySeconds']
    this.onPhase(runtime.attack, runtime.phase, duration > 0 ? 1 - runtime.remaining / duration : 1, runtime.targetPosition)
  }

  private setPhase(phase: BossAttackPhase | null): void {
    const runtime = this.current
    if (!runtime) return
    if (phase === null) {
      this.onPhase(runtime.attack, null, 0, runtime.targetPosition)
      this.current = null
      return
    }
    runtime.phase = phase
    runtime.remaining = phase === 'cooldown' ? runtime.attack.cooldownSeconds : runtime.attack[`${phase}Seconds` as 'windupSeconds' | 'activeSeconds' | 'recoverySeconds']
    this.notify()
  }

  private duration(attack: BossAttackDefinition, phase: BossAttackPhase): number {
    if (phase === 'cooldown') return attack.cooldownSeconds
    if (phase === 'windup') return attack.windupSeconds
    if (phase === 'active') return attack.activeSeconds
    return attack.recoverySeconds
  }

  private pickWeighted(attacks: readonly BossAttackDefinition[], random: () => number): BossAttackDefinition {
    const total = attacks.reduce((sum, attack) => sum + (attack.weight ?? 1), 0)
    let choice = random() * total
    for (const attack of attacks) {
      choice -= attack.weight ?? 1
      if (choice <= 0) return attack
    }
    return attacks[attacks.length - 1]
  }

  private validateAttack(attack: BossAttackDefinition): void {
    if (!attack.id || !attack.phases.length) throw new Error('Boss attack requires an ID and at least one phase')
    for (const [key, value] of [
      ['minRange', attack.minRange], ['maxRange', attack.maxRange], ['cooldown', attack.cooldownSeconds],
      ['windup', attack.windupSeconds], ['active', attack.activeSeconds], ['recovery', attack.recoverySeconds], ['damage', attack.damage],
    ] as const) if (!Number.isFinite(value) || value < 0) throw new RangeError(`Boss attack ${attack.id} has invalid ${key}`)
    if (attack.pattern === 'burst') {
      const count = attack.burstCount ?? 1
      const interval = attack.burstIntervalSeconds ?? attack.activeSeconds
      if (!Number.isSafeInteger(count) || count < 1) throw new RangeError(`Boss burst ${attack.id} requires a positive integer count`)
      if (!Number.isFinite(interval) || interval < 0) throw new RangeError(`Boss burst ${attack.id} has an invalid interval`)
      if (count > 1 && (interval <= 0 || attack.activeSeconds + EPSILON < (count - 1) * interval)) {
        throw new RangeError(`Boss burst ${attack.id} active duration is too short for its configured shots`)
      }
    }
    if (attack.pattern === 'arc-nodes') {
      if (!Number.isFinite(attack.nodeRange) || (attack.nodeRange ?? 0) < 2 || (attack.nodeRange ?? 0) > 16
        || !Number.isFinite(attack.linkWidth) || (attack.linkWidth ?? 0) <= 0 || (attack.linkWidth ?? 0) > 1
        || !Number.isFinite(attack.tickIntervalSeconds) || (attack.tickIntervalSeconds ?? 0) < 0.12
        || !Number.isFinite(attack.nodeHealth) || (attack.nodeHealth ?? 0) <= 0 || (attack.nodeHealth ?? 0) > 500) {
        throw new RangeError(`Boss arc ${attack.id} has invalid node/link limits`)
      }
    }
  }
}
