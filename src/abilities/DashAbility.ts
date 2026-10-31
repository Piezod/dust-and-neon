import type { CharacterStats } from '../core/CharacterStats'
import { Ability } from './Ability'
import type { AbilityActivationContext, AbilityDefinition, AbilityDirection, AbilityMovement } from './Ability.types'

export interface DashConfig extends AbilityDefinition {
  readonly durationSeconds: number
  readonly speed: number
}

export class DashAbility extends Ability {
  private direction: AbilityDirection = { x: 0, z: 1 }
  private remainingDuration = 0
  readonly config: DashConfig

  constructor(stats: CharacterStats, config: DashConfig) {
    super(config, stats)
    this.config = config
    if (!Number.isFinite(config.durationSeconds) || config.durationSeconds <= 0) throw new RangeError('Dash duration must be positive and finite')
    if (!Number.isFinite(config.speed) || config.speed < 0) throw new RangeError('Dash speed must be non-negative and finite')
  }

  protected onActivate(context: AbilityActivationContext): void {
    const direction = context.movementDirection
    const magnitude = direction ? Math.hypot(direction.x, direction.z) : 0
    this.direction = magnitude > 0
      ? { x: direction!.x / magnitude, z: direction!.z / magnitude }
      : { x: 0, z: 1 }
    this.remainingDuration = this.config.durationSeconds
    this.active = true
  }

  protected onCancel(): void {
    this.remainingDuration = 0
  }

  consumeMovement(deltaTime: number): AbilityMovement | null {
    if (!this.active || deltaTime <= 0) return null
    const duration = Math.min(deltaTime, this.remainingDuration)
    this.remainingDuration = Math.max(0, this.remainingDuration - duration)
    if (this.remainingDuration === 0) this.active = false
    return { direction: this.direction, speed: this.config.speed, duration }
  }
}