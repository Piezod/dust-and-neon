import type { AbilityFactory } from '../abilities/Ability.types'
import { DashAbility } from '../abilities/DashAbility'
import type { CharacterStats } from '../core/CharacterStats'

export const DASH_ABILITY_CONFIG = Object.freeze({
  id: 'dash',
  name: 'DASH',
  inputCode: 'ShiftLeft',
  inputLabel: 'SHIFT',
  energyCost: 20,
  cooldownSeconds: 2,
  durationSeconds: 0.18,
  speed: 30,
})

export function createPlayerAbilityFactories(stats: CharacterStats): readonly AbilityFactory[] {
  return [() => new DashAbility(stats, DASH_ABILITY_CONFIG)]
}