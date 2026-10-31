import * as THREE from 'three'
import { AttackController } from './AttackController'
import type { AttackDefinition, CombatSource, DamageContext, ProjectileDefinition } from './Combat.types'
import type { Damageable } from './Damageable'
import { ProjectileSystem } from './ProjectileSystem'
import { DamageResolver } from './DamageResolver'

export class CombatSystem {
  private readonly attack: AttackController
  private readonly projectiles: ProjectileSystem
  private readonly damageResolver = new DamageResolver()
  private readonly targets = new Map<string, Damageable>()
  private disposed = false
  private readonly obstacles: readonly THREE.Box2[]
  private readonly canAttack: () => boolean

  constructor(
    parent: THREE.Object3D,
    obstacles: readonly THREE.Box2[],
    attack: AttackDefinition,
    source: CombatSource,
    canAttack: () => boolean = () => true,
  ) {
    this.obstacles = obstacles
    this.canAttack = canAttack
    this.attack = new AttackController(attack, source)
    this.projectiles = new ProjectileSystem(parent)
  }

  get shotsFired(): number {
    return this.attack.shotsFired
  }

  get projectileCount(): number {
    return this.projectiles.activeCount
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

  applyDamage(target: Damageable, context: DamageContext): boolean {
    if (this.disposed) return false
    return this.damageResolver.apply(target, context)
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
      this.projectiles.spawn(this.attack.definition, this.attack.source, shot.position, shot.direction)
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