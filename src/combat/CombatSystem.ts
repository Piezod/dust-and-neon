import * as THREE from 'three'
import { AttackController } from './AttackController'
import type { AttackDefinition, CombatSource, DamageContext, ProjectileDefinition } from './Combat.types'
import type { Damageable } from './Damageable'
import { ProjectileSystem } from './ProjectileSystem'
import { DamageResolver } from './DamageResolver'
import type { GameEventBus } from '../events/GameEventBus'

export class CombatSystem {
  private readonly attack: AttackController
  private readonly projectiles: ProjectileSystem
  private readonly damageResolver = new DamageResolver()
  private readonly targets = new Map<string, Damageable>()
  private disposed = false
  private readonly obstacles: readonly THREE.Box2[]
  private readonly canAttack: () => boolean
  private readonly events?: GameEventBus

  constructor(
    parent: THREE.Object3D,
    obstacles: readonly THREE.Box2[],
    attack: AttackDefinition,
    source: CombatSource,
    canAttack: () => boolean = () => true,
    events?: GameEventBus,
  ) {
    this.obstacles = obstacles
    this.canAttack = canAttack
    this.events = events
    this.attack = new AttackController(attack, source)
    this.projectiles = new ProjectileSystem(parent, events)
  }

  get shotsFired(): number {
    return this.attack.shotsFired
  }

  get effectiveAttackStats(): ReturnType<AttackController['getEffectiveStats']> {
    return this.attack.getEffectiveStats()
  }

  addAttackModifier(modifier: Parameters<AttackController['addModifier']>[0]): void {
    this.attack.addModifier(modifier)
  }

  removeAttackModifier(id: string): boolean {
    return this.attack.removeModifier(id)
  }

  get projectileCount(): number {
    return this.projectiles.activeCount
  }

  getDebugProjectilePaths(): ReturnType<ProjectileSystem['getDebugPaths']> {
    return this.projectiles.getDebugPaths()
  }

  registerTarget(target: Damageable): void {
    if (this.targets.has(target.combatId)) throw new Error(`Duplicate combat target id: ${target.combatId}`)
    this.targets.set(target.combatId, target)
  }

  unregisterTarget(id: string): boolean {
    return this.targets.delete(id)
  }

  spawnProjectile(definition: ProjectileDefinition, source: CombatSource, position: THREE.Vector3, direction: THREE.Vector3): void {
    if (this.disposed) return
    if (source.id === this.attack.source.id && !this.canAttack()) return
    this.projectiles.spawn(definition, source, position, direction)
  }

  spawnArcVisual(definition: ProjectileDefinition, source: CombatSource, start: THREE.Vector3, target: THREE.Vector3, durationSeconds: number, apexHeight: number): void {
    if (this.disposed || source.id === this.attack.source.id && !this.canAttack()) return
    this.projectiles.spawnArcVisual(definition, source, start, target, durationSeconds, apexHeight)
  }

  applyDamage(target: Damageable, context: DamageContext): boolean {
    if (this.disposed) return false
    const applied = this.damageResolver.apply(target, context)
    if (applied && target.faction === 'player' && context.sourcePosition) {
      this.events?.emit({ type: 'player-hit-source', position: context.sourcePosition })
    }
    return applied
  }

  update(deltaTime: number, firing: boolean, muzzle: THREE.Vector3, aimPoint: THREE.Vector3, advanceProjectiles = true): void {
    if (this.disposed) return
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    const alive = this.canAttack()
    if (!alive) this.attack.cancel()
    if (!advanceProjectiles) return
    const shots = this.attack.advance(elapsed, firing && alive, muzzle, aimPoint)
    const targets = Array.from(this.targets.values())
    let previousOffset = 0
    for (const shot of shots) {
      this.projectiles.update(shot.offsetSeconds - previousOffset, this.obstacles, targets)
      this.projectiles.spawn(shot.definition, this.attack.source, shot.position, shot.direction)
      previousOffset = shot.offsetSeconds
    }
    this.projectiles.update(elapsed - previousOffset, this.obstacles, targets)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.targets.clear()
    this.projectiles.dispose()
  }
}