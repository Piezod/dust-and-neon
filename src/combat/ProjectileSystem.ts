import * as THREE from 'three'
import type { ProjectileDefinition, CombatSource, DamageContext } from './Combat.types'
import { DamageResolver } from './DamageResolver'
import type { Damageable } from './Damageable'

interface Projectile {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  readonly direction: THREE.Vector3
  readonly definition: ProjectileDefinition
  readonly source: CombatSource
  readonly material: THREE.MeshStandardMaterial
  remainingRange: number
}

export class ProjectileSystem {
  private readonly projectiles: Projectile[] = []
  private readonly geometry = new THREE.SphereGeometry(1, 10, 8)
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  private readonly resolver = new DamageResolver()
  private readonly start = new THREE.Vector2()
  private readonly end = new THREE.Vector2()
  private readonly segment = new THREE.Vector2()
  private disposed = false
  private readonly parent: THREE.Object3D

  constructor(parent: THREE.Object3D) {
    this.parent = parent
  }

  get activeCount(): number {
    return this.projectiles.length
  }

  spawn(definition: ProjectileDefinition, source: CombatSource, position: THREE.Vector3, direction: THREE.Vector3): void {
    if (this.disposed) return
    const material = this.getMaterial(definition)
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.name = `Projectile:${definition.id}`
    mesh.position.copy(position)
    mesh.scale.setScalar(definition.projectileRadius)
    mesh.castShadow = false
    mesh.receiveShadow = false
    this.parent.add(mesh)
    this.projectiles.push({
      mesh,
      direction: direction.clone().setY(0).normalize(),
      definition,
      source,
      material,
      remainingRange: definition.maxRange,
    })
  }

  update(deltaTime: number, obstacles: readonly THREE.Box2[], targets: readonly Damageable[]): void {
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    for (let index = this.projectiles.length - 1; index >= 0; index--) {
      const projectile = this.projectiles[index]
      const distance = Math.min(projectile.definition.projectileSpeed * elapsed, projectile.remainingRange)
      if (distance > 0) {
        this.start.set(projectile.mesh.position.x, projectile.mesh.position.z)
        this.end.copy(this.start).addScaledVector(this.segment.set(projectile.direction.x, projectile.direction.z), distance)
        const wallEntry = this.findNearestObstacle(this.start, this.end, obstacles, projectile.definition.projectileRadius)
        const targetHit = this.findNearestTarget(this.start, this.end, targets, projectile)

        if (targetHit && targetHit.entry < (wallEntry ?? Infinity)) {
          const hitPoint = this.start.clone().lerp(this.end, targetHit.entry)
          projectile.mesh.position.set(hitPoint.x, projectile.mesh.position.y, hitPoint.y)
          const context: DamageContext = {
            sourceId: projectile.source.id,
            sourceFaction: projectile.source.faction,
            amount: projectile.definition.damage,
            type: projectile.definition.damageType,
          }
          this.resolver.apply(targetHit.target, context)
          this.removeAt(index)
          continue
        }

        if (wallEntry !== null) {
          const hitPoint = this.start.clone().lerp(this.end, wallEntry)
          projectile.mesh.position.set(hitPoint.x, projectile.mesh.position.y, hitPoint.y)
          this.removeAt(index)
          continue
        }

        projectile.mesh.position.set(this.end.x, projectile.mesh.position.y, this.end.y)
        projectile.remainingRange -= distance
      }
      if (projectile.remainingRange <= Number.EPSILON) this.removeAt(index)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    while (this.projectiles.length > 0) this.removeAt(this.projectiles.length - 1)
    this.geometry.dispose()
    for (const material of this.materials.values()) material.dispose()
    this.materials.clear()
  }

  private getMaterial(definition: ProjectileDefinition): THREE.MeshStandardMaterial {
    const existing = this.materials.get(definition.id)
    if (existing) return existing
    const material = new THREE.MeshStandardMaterial({
      color: definition.projectileColor ?? '#c4fff3',
      emissive: definition.projectileEmissive ?? '#12d9ba',
      emissiveIntensity: definition.projectileEmissiveIntensity ?? 2.2,
      roughness: 0.3,
    })
    this.materials.set(definition.id, material)
    return material
  }

  private findNearestTarget(
    start: THREE.Vector2,
    end: THREE.Vector2,
    targets: readonly Damageable[],
    projectile: Projectile,
  ): { readonly target: Damageable; readonly entry: number } | null {
    let nearest: { target: Damageable; entry: number } | null = null
    for (const target of targets) {
      if (target.combatId === projectile.source.id || target.faction === projectile.source.faction) continue
      const bounds = target.getCombatBounds()
      const entry = this.segmentCircleEntry(start, end, bounds.x, bounds.z, bounds.radius + projectile.definition.projectileRadius)
      if (entry !== null && (nearest === null || entry < nearest.entry)) nearest = { target, entry }
    }
    return nearest
  }

  private findNearestObstacle(start: THREE.Vector2, end: THREE.Vector2, obstacles: readonly THREE.Box2[], radius: number): number | null {
    let nearest: number | null = null
    for (const obstacle of obstacles) {
      const entry = this.segmentBoxEntry(start, end, obstacle.min.x - radius, obstacle.min.y - radius, obstacle.max.x + radius, obstacle.max.y + radius)
      if (entry !== null && (nearest === null || entry < nearest)) nearest = entry
    }
    return nearest
  }

  private segmentCircleEntry(start: THREE.Vector2, end: THREE.Vector2, centerX: number, centerZ: number, radius: number): number | null {
    const dx = end.x - start.x
    const dz = end.y - start.y
    const offsetX = start.x - centerX
    const offsetZ = start.y - centerZ
    const a = dx * dx + dz * dz
    if (offsetX * offsetX + offsetZ * offsetZ <= radius * radius) return 0
    if (a === 0) return offsetX * offsetX + offsetZ * offsetZ <= radius * radius ? 0 : null
    const b = 2 * (offsetX * dx + offsetZ * dz)
    const c = offsetX * offsetX + offsetZ * offsetZ - radius * radius
    const discriminant = b * b - 4 * a * c
    if (discriminant < 0) return null
    const entry = (-b - Math.sqrt(discriminant)) / (2 * a)
    return entry >= 0 && entry <= 1 ? entry : null
  }

  private segmentBoxEntry(start: THREE.Vector2, end: THREE.Vector2, minX: number, minZ: number, maxX: number, maxZ: number): number | null {
    const dx = end.x - start.x
    const dz = end.y - start.y
    let entry = 0
    let exit = 1
    for (const [origin, delta, minimum, maximum] of [[start.x, dx, minX, maxX], [start.y, dz, minZ, maxZ]]) {
      if (Math.abs(delta) < 1e-12) {
        if (origin < minimum || origin > maximum) return null
        continue
      }
      const first = (minimum - origin) / delta
      const second = (maximum - origin) / delta
      entry = Math.max(entry, Math.min(first, second))
      exit = Math.min(exit, Math.max(first, second))
      if (entry > exit) return null
    }
    return entry >= 0 && entry <= 1 ? entry : null
  }

  private removeAt(index: number): void {
    const [projectile] = this.projectiles.splice(index, 1)
    projectile.mesh.removeFromParent()
  }
}