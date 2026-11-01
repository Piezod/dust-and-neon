import * as THREE from 'three'
import type { CombatSource } from '../combat/Combat.types'
import type { CombatSystem } from '../combat/CombatSystem'
import type { Damageable } from '../combat/Damageable'
import type { GameEventBus } from '../events/GameEventBus'
import { EXPERIMENTAL_ENEMY_BY_ID, EXPERIMENTAL_ENEMY_DEFINITIONS } from '../config/experimentalEnemies.config'
import { ExperimentalAttackController } from './ExperimentalAttackController'
import { EnemyManager } from './EnemyManager'
import type { EnemyDefinition } from './Enemy.types'

export interface ExperimentalEnemyAuthorityContext {
  readonly role: 'local' | 'host' | 'guest'
  readonly getTargets: () => readonly Damageable[]
  readonly random?: () => number
}

const MAX_MANUAL_EXPERIMENTAL_ENEMIES = 12

export class ExperimentalEnemyFactory {
  readonly manager: EnemyManager
  private readonly context: ExperimentalEnemyAuthorityContext

  constructor(
    scene: THREE.Scene,
    obstacles: readonly THREE.Box2[],
    combat: CombatSystem,
    context: ExperimentalEnemyAuthorityContext,
    events?: GameEventBus,
  ) {
    validateExperimentalEnemyCatalog(EXPERIMENTAL_ENEMY_DEFINITIONS)
    if (context.getTargets().length === 0) throw new Error('Experimental enemy tests require at least one target')
    this.context = context
    this.manager = new EnemyManager(
      scene,
      obstacles,
      combat,
      context.getTargets()[0],
      EXPERIMENTAL_ENEMY_DEFINITIONS,
      events,
      0.38,
      () => context.getTargets().filter(isAlive),
      context.random ?? Math.random,
    )
  }

  create(id: string, requestedPosition: THREE.Vector3): ReturnType<EnemyManager['spawn']> {
    if (this.context.role === 'guest') throw new Error('Experimental enemy simulation is authority-only.')
    const definition = EXPERIMENTAL_ENEMY_BY_ID.get(id)
    if (!definition || definition.experimental?.enabledInNormalRuns !== false) throw new Error(`Unknown experimental enemy: ${id}`)
    if (this.manager.aliveCount >= MAX_MANUAL_EXPERIMENTAL_ENEMIES) throw new RangeError('Experimental arena entity limit reached')
    return this.manager.spawn(id, requestedPosition, 0)
  }

  update(deltaTime: number): void {
    if (this.context.role === 'guest') throw new Error('Guests may render snapshots but cannot simulate experimental enemies.')
    this.manager.update(deltaTime)
  }

  dispose(): void {
    this.manager.dispose()
  }
}

export function validateExperimentalEnemyCatalog(definitions: readonly EnemyDefinition[]): void {
  const ids = new Set<string>()
  for (const definition of definitions) {
    const profile = definition.experimental
    if (!profile || profile.enabledInNormalRuns !== false) throw new Error(`Experimental enemy ${definition.id} is not disabled in normal runs`)
    if (!definition.id || ids.has(definition.id)) throw new Error(`Experimental enemy ID is invalid or duplicated: ${definition.id}`)
    ids.add(definition.id)
    if (!Number.isFinite(definition.maxHealth) || definition.maxHealth <= 0 || !Number.isFinite(definition.moveSpeed) || definition.moveSpeed < 0
      || !Number.isFinite(definition.collisionRadius) || definition.collisionRadius <= 0 || !Number.isFinite(definition.detectionRange) || definition.detectionRange <= 0) {
      throw new RangeError(`Experimental enemy ${definition.id} has invalid combat statistics`)
    }
    if (definition.attacks.length !== 0) throw new Error(`Experimental enemy ${definition.id} must not enter the normal attack list`)
    if (profile.attacks.length === 0 || !Number.isSafeInteger(profile.maxGeneratedEntities) || profile.maxGeneratedEntities < 0 || profile.maxGeneratedEntities > 4) {
      throw new RangeError(`Experimental enemy ${definition.id} has an invalid attack or entity limit`)
    }
    if (!Number.isSafeInteger(profile.rewardGold[0]) || !Number.isSafeInteger(profile.rewardGold[1]) || profile.rewardGold[0] < 0 || profile.rewardGold[1] < profile.rewardGold[0]) {
      throw new RangeError(`Experimental enemy ${definition.id} has invalid reward guidance`)
    }
    for (const [type, multiplier] of Object.entries(definition.resistances ?? {})) {
      if (!Number.isFinite(multiplier) || multiplier < 0.1 || multiplier > 2.5) throw new RangeError(`Experimental enemy ${definition.id} has invalid ${type} resistance`)
    }
    if (definition.frontResistance && (!Number.isFinite(definition.frontResistance.halfAngleRadians)
      || definition.frontResistance.halfAngleRadians <= 0 || definition.frontResistance.halfAngleRadians > Math.PI / 2
      || !Number.isFinite(definition.frontResistance.damageMultiplier) || definition.frontResistance.damageMultiplier < 0.1 || definition.frontResistance.damageMultiplier > 1)) {
      throw new RangeError(`Experimental enemy ${definition.id} has invalid frontal resistance`)
    }
    const attackIds = new Set<string>()
    for (const attack of profile.attacks) {
      if (attackIds.has(attack.id)) throw new Error(`Experimental enemy ${definition.id} has duplicate attack ${attack.id}`)
      attackIds.add(attack.id)
    }
    const source: CombatSource = { id: `catalog-validation:${definition.id}`, faction: 'enemies' }
    new ExperimentalAttackController(profile.attacks, source, () => undefined).dispose()
  }
}

function isAlive(target: Damageable): boolean {
  if ('isAlive' in target && typeof target.isAlive === 'boolean') return target.isAlive
  if ('isDead' in target && typeof target.isDead === 'boolean') return !target.isDead
  if ('currentHealth' in target && typeof target.currentHealth === 'number') return target.currentHealth > 0
  return true
}
