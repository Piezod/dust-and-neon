import type { Ability } from './Ability'

export type AbilityId = string

export interface AbilityDirection {
  readonly x: number
  readonly z: number
}

export interface AbilityDefinition {
  readonly id: AbilityId
  readonly name: string
  readonly inputCode: string
  readonly inputLabel: string
  readonly energyCost: number
  readonly cooldownSeconds: number
}

export interface AbilityActivationContext {
  readonly movementDirection?: AbilityDirection
}

export interface AbilityMovement {
  readonly direction: AbilityDirection
  readonly speed: number
  readonly duration: number
}

export type AbilityRejectionReason = 'unknown-ability' | 'already-active' | 'cooldown' | 'insufficient-energy' | 'dead'

export type AbilityActivationResult =
  | { readonly activated: true; readonly abilityId: AbilityId }
  | { readonly activated: false; readonly abilityId: AbilityId; readonly reason: AbilityRejectionReason }

export interface AbilityState {
  readonly id: AbilityId
  readonly name: string
  readonly inputLabel: string
  readonly active: boolean
  readonly available: boolean
  readonly energySufficient: boolean
  readonly cooldownRemaining: number
  readonly energyCost: number
}

export type AbilityFactory = () => Ability