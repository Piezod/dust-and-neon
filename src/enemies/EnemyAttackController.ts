import * as THREE from 'three'
import type { CombatSystem } from '../combat/CombatSystem'
import type { CombatSource, DamageContext } from '../combat/Combat.types'
import type { Damageable } from '../combat/Damageable'
import type { EnemyAttackDefinition, EnemyAttackPhase, EnemyAttackPhaseState, EnemyAttackType } from './Enemy.types'

interface AttackExecutionContext {
  readonly attack: EnemyAttackDefinition
  readonly source: CombatSource
  readonly origin: THREE.Vector3
  readonly targetPosition: THREE.Vector3
  readonly target: Damageable
  readonly combat: CombatSystem
}

interface EnemyAttackExecutor {
  execute(context: AttackExecutionContext): void
}

interface AttackRuntime {
  readonly attack: EnemyAttackDefinition
  phase: EnemyAttackPhase
  remaining: number
  nextBurstIn: number
  burstsRemaining: number
}

export type AttackPhaseListener = (attackId: string, phase: EnemyAttackPhase | null, progress: number) => void

const ATTACK_EXECUTORS: Partial<Record<EnemyAttackType, EnemyAttackExecutor>> = {
  melee: {
    execute({ attack, source, origin, target, combat }): void {
      const context: DamageContext = {
        sourceId: source.id,
        sourceFaction: source.faction,
        amount: attack.damage,
        type: attack.damageType,
        sourcePosition: [origin.x, origin.y, origin.z],
        effects: attack.statusEffects,
      }
      combat.applyDamage(target, context)
    },
  },
  projectile: {
    execute({ attack, source, origin, targetPosition, combat }): void {
      if (!attack.projectile) return
      const direction = new THREE.Vector3(targetPosition.x - origin.x, 0, targetPosition.z - origin.z)
      if (direction.lengthSq() === 0) return
      combat.spawnProjectile(attack.projectile, source, origin, direction.normalize())
    },
  },
}

const DEFAULT_WINDUP_SECONDS = 0
const DEFAULT_ACTIVE_SECONDS = 0.1
const DEFAULT_RECOVERY_SECONDS = 0
const PHASE_EPSILON = 1e-8

export class EnemyAttackController {
  private readonly cooldowns = new Map<string, number>()
  private readonly attacks: readonly EnemyAttackDefinition[]
  private readonly source: CombatSource
  private readonly combat: CombatSystem
  private readonly onPhaseChange?: AttackPhaseListener
  private current: AttackRuntime | null = null

  constructor(attacks: readonly EnemyAttackDefinition[], source: CombatSource, combat: CombatSystem, onPhaseChange?: AttackPhaseListener) {
    this.attacks = attacks
    this.source = source
    this.combat = combat
    this.onPhaseChange = onPhaseChange
    for (const attack of attacks) {
      this.validateAttack(attack)
      this.cooldowns.set(attack.id, 0)
    }
  }

  getCooldownRemaining(attackId: string): number {
    return this.cooldowns.get(attackId) ?? 0
  }

  getPhaseState(): EnemyAttackPhaseState | null {
    const runtime = this.current
    if (!runtime) return null
    const duration = runtime.phase === 'cooldown' ? runtime.attack.cooldownSeconds : this.phaseDuration(runtime.attack, runtime.phase)
    return {
      attackId: runtime.attack.id,
      phase: runtime.phase,
      progress: duration > 0 ? THREE.MathUtils.clamp(1 - runtime.remaining / duration, 0, 1) : 1,
      remainingSeconds: runtime.remaining,
    }
  }

  selectAttack(distance: number): EnemyAttackDefinition | null {
    if (this.current) return null
    const available = this.attacks.filter((attack) =>
      this.hasExecutor(attack)
      && this.getCooldownRemaining(attack.id) <= 0
      && distance >= attack.minRange
      && distance <= attack.maxRange,
    )
    available.sort((first, second) => second.priority - first.priority || (first.id < second.id ? -1 : first.id > second.id ? 1 : 0))
    return available[0] ?? null
  }

  update(deltaTime: number, canAttack: boolean, distance: number, origin: THREE.Vector3, targetPosition: THREE.Vector3, target: Damageable): string | null {
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    this.advanceCooldowns(elapsed)
    if (this.current) {
      if (!canAttack && this.current.phase === 'windup') return null
      this.advanceCurrent(elapsed, canAttack, origin, targetPosition, target)
      return null
    }
    if (!canAttack) return null
    const attack = this.selectAttack(distance)
    if (!attack) return null
    this.current = {
      attack,
      phase: 'windup',
      remaining: this.phaseDuration(attack, 'windup'),
      nextBurstIn: 0,
      burstsRemaining: 0,
    }
    this.setPhase('windup')
    if (this.current.remaining <= 0) this.enterActive(origin, targetPosition, target)
    return attack.id
  }

  private advanceCooldowns(deltaTime: number): void {
    for (const [id, remaining] of this.cooldowns) {
      if (remaining <= 0) continue
      const next = Math.max(0, remaining - deltaTime)
      const clamped = next <= PHASE_EPSILON ? 0 : next
      this.cooldowns.set(id, clamped)
      if (this.current?.phase === 'cooldown' && this.current.attack.id === id) this.current.remaining = clamped
    }
    if (this.current?.phase === 'cooldown' && this.getCooldownRemaining(this.current.attack.id) === 0) this.setPhase(null)
  }

  private advanceCurrent(deltaTime: number, canAttack: boolean, origin: THREE.Vector3, targetPosition: THREE.Vector3, target: Damageable): void {
    let remainingFrame = deltaTime
    let transitions = 0
    while (this.current && transitions < 5) {
      const runtime = this.current
      if (runtime.phase === 'cooldown') return
      if (runtime.phase === 'active' && runtime.attack.type === 'projectile' && !canAttack) runtime.burstsRemaining = 0
      if (runtime.phase === 'active' && runtime.attack.type === 'projectile' && runtime.burstsRemaining > 0) {
        const step = Math.min(remainingFrame, runtime.remaining, runtime.nextBurstIn)
        runtime.remaining -= step
        runtime.nextBurstIn -= step
        remainingFrame -= step
        if (runtime.nextBurstIn <= PHASE_EPSILON && runtime.burstsRemaining > 0 && runtime.remaining > PHASE_EPSILON) {
          this.execute(runtime.attack, origin, targetPosition, target)
          runtime.burstsRemaining--
          runtime.nextBurstIn = Math.max(PHASE_EPSILON, runtime.attack.burstIntervalSeconds ?? 0.1)
          continue
        }
        if (runtime.remaining > PHASE_EPSILON && remainingFrame <= PHASE_EPSILON) return
      } else {
        const step = Math.min(remainingFrame, runtime.remaining)
        runtime.remaining -= step
        remainingFrame -= step
        if (runtime.remaining > PHASE_EPSILON && remainingFrame <= PHASE_EPSILON) return
      }

      if (runtime.remaining > PHASE_EPSILON) return
      transitions++
      if (runtime.phase === 'windup') this.enterActive(origin, targetPosition, target)
      else if (runtime.phase === 'active') this.enterRecovery()
      else if (runtime.phase === 'recovery') this.enterCooldown()
      if (remainingFrame <= PHASE_EPSILON && this.current?.phase !== 'active') return
    }
  }

  private enterActive(origin: THREE.Vector3, targetPosition: THREE.Vector3, target: Damageable): void {
    const runtime = this.current
    if (!runtime) return
    runtime.phase = 'active'
    runtime.remaining = this.phaseDuration(runtime.attack, 'active')
    const burstCount = runtime.attack.type === 'projectile' ? runtime.attack.burstCount ?? 1 : 1
    this.execute(runtime.attack, origin, targetPosition, target)
    runtime.burstsRemaining = Math.max(0, burstCount - 1)
    runtime.nextBurstIn = Math.max(PHASE_EPSILON, runtime.attack.burstIntervalSeconds ?? runtime.remaining)
    this.setPhase('active')
    if (runtime.remaining <= PHASE_EPSILON) this.enterRecovery()
  }

  private enterRecovery(): void {
    const runtime = this.current
    if (!runtime) return
    runtime.phase = 'recovery'
    runtime.remaining = this.phaseDuration(runtime.attack, 'recovery')
    this.setPhase('recovery')
    if (runtime.remaining <= PHASE_EPSILON) this.enterCooldown()
  }

  private enterCooldown(): void {
    const runtime = this.current
    if (!runtime) return
    runtime.phase = 'cooldown'
    runtime.remaining = runtime.attack.cooldownSeconds
    this.cooldowns.set(runtime.attack.id, runtime.attack.cooldownSeconds)
    this.setPhase('cooldown')
    if (runtime.remaining <= PHASE_EPSILON) this.setPhase(null)
  }

  private execute(attack: EnemyAttackDefinition, origin: THREE.Vector3, targetPosition: THREE.Vector3, target: Damageable): void {
    ATTACK_EXECUTORS[attack.type]?.execute({ attack, source: this.source, origin, targetPosition, target, combat: this.combat })
  }

  private phaseDuration(attack: EnemyAttackDefinition, phase: 'windup' | 'active' | 'recovery'): number {
    if (phase === 'windup') return attack.windupSeconds ?? DEFAULT_WINDUP_SECONDS
    if (phase === 'active') return attack.activeSeconds ?? DEFAULT_ACTIVE_SECONDS
    return attack.recoverySeconds ?? DEFAULT_RECOVERY_SECONDS
  }

  private setPhase(phase: EnemyAttackPhase | null): void {
    if (!this.current) return
    this.onPhaseChange?.(this.current.attack.id, phase, this.getPhaseState()?.progress ?? 0)
    if (phase === null) this.current = null
  }

  private hasExecutor(attack: EnemyAttackDefinition): boolean {
    return Boolean(ATTACK_EXECUTORS[attack.type]) && (attack.type !== 'projectile' || Boolean(attack.projectile))
  }

  private validateAttack(attack: EnemyAttackDefinition): void {
    if (!attack.id || !this.hasExecutor(attack)) throw new Error(`Attack ${attack.id} has no executor`)
    for (const [name, value] of [
      ['cooldownSeconds', attack.cooldownSeconds],
      ['windupSeconds', attack.windupSeconds ?? DEFAULT_WINDUP_SECONDS],
      ['activeSeconds', attack.activeSeconds ?? DEFAULT_ACTIVE_SECONDS],
      ['recoverySeconds', attack.recoverySeconds ?? DEFAULT_RECOVERY_SECONDS],
      ['burstIntervalSeconds', attack.burstIntervalSeconds ?? 0],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) throw new RangeError(`Attack ${attack.id} ${name} must be finite and non-negative`)
    }
    if (!Number.isSafeInteger(attack.burstCount ?? 1) || (attack.burstCount ?? 1) < 1) {
      throw new RangeError(`Attack ${attack.id} burstCount must be a positive integer`)
    }
  }
}