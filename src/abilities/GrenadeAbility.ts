import type { CharacterStats } from '../core/CharacterStats'
import { Ability } from './Ability'
import type {
  AbilityActivationContext,
  AbilityDefinition,
} from './Ability.types'

export interface GrenadeConfig extends AbilityDefinition {
  readonly damage: number
  readonly explosionRadius: number
  readonly fuseSeconds: number
  readonly throwRange: number
}

export class GrenadeAbility extends Ability {

  readonly config: GrenadeConfig

  constructor(stats: CharacterStats, config: GrenadeConfig) {
    super(config, stats)
    this.config = config
  }

  protected onActivate(_context: AbilityActivationContext): void {
    // Aquí implementaremos el lanzamiento.
  }
}