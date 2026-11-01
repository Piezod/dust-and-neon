import type { DamageContext, DamageStatusApplication } from './Combat.types'

interface StatusSource {
  readonly id: string
  readonly faction: string
}

interface BurnState {
  remaining: number
  damagePerSecond: number
  interval: number
  tickRemaining: number
  readonly source: StatusSource
}

interface SlowState {
  remaining: number
  movementMultiplier: number
}

interface ShockState {
  remaining: number
}

const MAX_DURATION_SECONDS = 8
const MAX_BURN_DAMAGE_PER_SECOND = 18
const MIN_SLOW_MULTIPLIER = 0.45
const MAX_SHOCK_SECONDS = 0.35
const MAX_BURN_TICKS_PER_UPDATE = 4

export class StatusEffects {
  private burn: BurnState | null = null
  private slow: SlowState | null = null
  private shock: ShockState | null = null

  get movementMultiplier(): number {
    return this.slow?.movementMultiplier ?? 1
  }

  get isStaggered(): boolean {
    return this.shock !== null
  }

  get activeTypes(): readonly DamageStatusApplication['type'][] {
    const active: DamageStatusApplication['type'][] = []
    if (this.burn) active.push('burn')
    if (this.slow) active.push('slow')
    if (this.shock) active.push('shock')
    return active
  }

  apply(effect: DamageStatusApplication, source: StatusSource): boolean {
    if (effect.type === 'burn') {
      if (!Number.isFinite(effect.durationSeconds) || effect.durationSeconds <= 0
        || !Number.isFinite(effect.damagePerSecond) || effect.damagePerSecond <= 0) return false
      const interval = clamp(effect.tickIntervalSeconds ?? 0.5, 0.2, 1)
      this.burn = {
        remaining: Math.min(MAX_DURATION_SECONDS, Math.max(this.burn?.remaining ?? 0, effect.durationSeconds)),
        damagePerSecond: Math.min(MAX_BURN_DAMAGE_PER_SECOND, Math.max(this.burn?.damagePerSecond ?? 0, effect.damagePerSecond)),
        interval,
        tickRemaining: Math.min(this.burn?.tickRemaining ?? interval, interval),
        source,
      }
      return true
    }
    if (effect.type === 'slow') {
      if (!Number.isFinite(effect.durationSeconds) || effect.durationSeconds <= 0
        || !Number.isFinite(effect.movementMultiplier)) return false
      this.slow = {
        remaining: Math.min(MAX_DURATION_SECONDS, Math.max(this.slow?.remaining ?? 0, effect.durationSeconds)),
        movementMultiplier: Math.max(MIN_SLOW_MULTIPLIER, Math.min(this.slow?.movementMultiplier ?? 1, effect.movementMultiplier, 1)),
      }
      return true
    }
    if (!Number.isFinite(effect.staggerSeconds) || effect.staggerSeconds <= 0) return false
    this.shock = { remaining: Math.min(MAX_SHOCK_SECONDS, Math.max(this.shock?.remaining ?? 0, effect.staggerSeconds)) }
    return true
  }

  update(deltaTime: number, applyDamage: (context: DamageContext) => void): void {
    const elapsed = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0
    if (this.burn) {
      this.burn.remaining = Math.max(0, this.burn.remaining - elapsed)
      this.burn.tickRemaining -= elapsed
      let ticks = 0
      while (this.burn && this.burn.tickRemaining <= 1e-8 && this.burn.remaining > 0 && ticks < MAX_BURN_TICKS_PER_UPDATE) {
        const burn = this.burn
        applyDamage({
          sourceId: burn.source.id,
          sourceFaction: burn.source.faction,
          amount: burn.damagePerSecond * burn.interval,
          type: 'fire',
        })
        burn.tickRemaining += burn.interval
        ticks++
      }
      if (this.burn?.remaining === 0) this.burn = null
    }
    if (this.slow) {
      this.slow.remaining = Math.max(0, this.slow.remaining - elapsed)
      if (this.slow.remaining === 0) this.slow = null
    }
    if (this.shock) {
      this.shock.remaining = Math.max(0, this.shock.remaining - elapsed)
      if (this.shock.remaining === 0) this.shock = null
    }
  }

  clear(): void {
    this.burn = null
    this.slow = null
    this.shock = null
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
