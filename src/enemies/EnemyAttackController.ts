import * as THREE from 'three'
import type { CombatSystem } from '../combat/CombatSystem'
import type { CombatSource, DamageContext } from '../combat/Combat.types'
import type { Damageable } from '../combat/Damageable'
import type { EnemyAttackDefinition, EnemyAttackType } from './Enemy.types'

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

const ATTACK_EXECUTORS: Partial<Record<EnemyAttackType, EnemyAttackExecutor>> = {
  melee: {
    execute({ attack, source, target, combat }): void {
      const context: DamageContext = {
        sourceId: source.id,
        sourceFaction: source.faction,
        amount: attack.damage,
        type: attack.damageType,
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

export class EnemyAttackController {
  private readonly cooldowns = new Map<string, number>()
  private readonly attacks: readonly EnemyAttackDefinition[]
  private readonly source: CombatSource
  private readonly combat: CombatSystem

  constructor(
    attacks: readonly EnemyAttackDefinition[],
    source: CombatSource,
    combat: CombatSystem,
  ) {
    this.attacks = attacks
    this.source = source
    this.combat = combat
    for (const attack of attacks) this.cooldowns.set(attack.id, 0)
  }

  getCooldownRemaining(attackId: string): number {
    return this.cooldowns.get(attackId) ?? 0
  }

  selectAttack(distance: number): EnemyAttackDefinition | null {
    const available = this.attacks.filter((attack) =>
      ATTACK_EXECUTORS[attack.type]
      && this.getCooldownRemaining(attack.id) <= 0
      && distance >= attack.minRange
      && distance <= attack.maxRange,
    )
    available.sort((first, second) => second.priority - first.priority || (first.id < second.id ? -1 : first.id > second.id ? 1 : 0))
    return available[0] ?? null
  }

  update(deltaTime: number, detected: boolean, distance: number, origin: THREE.Vector3, targetPosition: THREE.Vector3, target: Damageable): string | null {
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    for (const [id, remaining] of this.cooldowns) {
      const next = remaining - elapsed
      const tolerance = Number.EPSILON * Math.max(1, remaining, elapsed) * 8
      this.cooldowns.set(id, next <= tolerance ? 0 : next)
    }
    if (!detected) return null
    const attack = this.selectAttack(distance)
    if (!attack) return null
    ATTACK_EXECUTORS[attack.type]?.execute({ attack, source: this.source, origin, targetPosition, target, combat: this.combat })
    this.cooldowns.set(attack.id, attack.cooldownSeconds)
    return attack.id
  }
}