import * as THREE from 'three'
import type { ProjectileDefinition, CombatSource, DamageContext } from './Combat.types'
import { DamageResolver } from './DamageResolver'
import type { Damageable } from './Damageable'
import type { GameEventBus } from '../events/GameEventBus'
import { VISUAL_THEME } from '../config/visualTheme'

const MAX_ACTIVE_PROJECTILES = 256

interface DebugProjectilePath {
  readonly start: readonly [number, number, number]
  readonly end: readonly [number, number, number]
  readonly faction: string
  remainingSeconds: number
}

interface Projectile {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  readonly trail: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>
  readonly direction: THREE.Vector3
  readonly origin: THREE.Vector3
  readonly definition: ProjectileDefinition
  readonly source: CombatSource
  readonly material: THREE.MeshStandardMaterial
  readonly arc?: { readonly start: THREE.Vector3; readonly end: THREE.Vector3; readonly duration: number; readonly apex: number; elapsed: number }
  remainingRange: number
}

export class ProjectileSystem {
  private readonly projectiles: Projectile[] = []
  private readonly geometry = new THREE.SphereGeometry(1, 10, 8)
  private readonly trailGeometry = new THREE.ConeGeometry(0.1, 1, 6, 1)
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  private readonly trailMaterials = new Map<string, THREE.MeshBasicMaterial>()
  private readonly resolver = new DamageResolver()
  private readonly start = new THREE.Vector2()
  private readonly end = new THREE.Vector2()
  private readonly segment = new THREE.Vector2()
  private readonly recentPaths: DebugProjectilePath[] = []
  private disposed = false
  private readonly parent: THREE.Object3D
  private readonly events?: GameEventBus

  constructor(parent: THREE.Object3D, events?: GameEventBus) {
    this.parent = parent
    this.events = events
  }

  get activeCount(): number {
    return this.projectiles.length
  }

  getDebugPaths(): readonly { readonly start: readonly [number, number, number]; readonly end: readonly [number, number, number]; readonly faction: string }[] {
    return [...this.recentPaths, ...this.projectiles.map((projectile) => {
      const start = projectile.mesh.position
      const length = Math.min(5, projectile.remainingRange)
      return {
        start: [start.x, start.y, start.z] as const,
        end: [start.x + projectile.direction.x * length, start.y, start.z + projectile.direction.z * length] as const,
        faction: projectile.source.faction,
      }
    })]
  }

  spawn(definition: ProjectileDefinition, source: CombatSource, position: THREE.Vector3, direction: THREE.Vector3): void {
    if (this.disposed || this.projectiles.length >= MAX_ACTIVE_PROJECTILES) return
    this.validateImpactEffects(definition)
    this.createProjectile(definition, source, position, direction)
  }

  spawnArcVisual(definition: ProjectileDefinition, source: CombatSource, start: THREE.Vector3, target: THREE.Vector3, durationSeconds: number, apexHeight: number): void {
    if (this.disposed || this.projectiles.length >= MAX_ACTIVE_PROJECTILES) return
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(apexHeight) || apexHeight < 0 || apexHeight > 12) return
    const direction = target.clone().sub(start).setY(0)
    if (direction.lengthSq() < 1e-8) return
    this.createProjectile(definition, source, start, direction.normalize(), {
      start: start.clone(), end: target.clone(), duration: durationSeconds, apex: apexHeight, elapsed: 0,
    })
  }

  private createProjectile(
    definition: ProjectileDefinition,
    source: CombatSource,
    position: THREE.Vector3,
    direction: THREE.Vector3,
    arc?: NonNullable<Projectile['arc']>,
  ): void {
    const material = this.getMaterial(definition)
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.name = `Projectile:${definition.id}`
    mesh.position.copy(position)
    mesh.scale.setScalar(Math.max(definition.projectileRadius, definition.id.includes('plasma') ? 0.34 : 0.26))
    mesh.castShadow = false
    mesh.receiveShadow = false
    const projectileDirection = direction.clone().setY(0).normalize()
    const trail = new THREE.Mesh(this.trailGeometry, this.getTrailMaterial(definition))
    trail.name = `ProjectileTrail:${definition.id}`
    trail.castShadow = false
    trail.receiveShadow = false
    trail.renderOrder = 9
    this.updateTrail(trail, mesh.position, projectileDirection, definition.id)
    this.parent.add(trail, mesh)
    this.projectiles.push({
      mesh,
      trail,
      direction: projectileDirection,
      origin: position.clone(),
      definition,
      source,
      material,
      ...(arc ? { arc } : {}),
      remainingRange: definition.maxRange,
    })
    this.events?.emit({
      type: 'projectile-spawned',
      projectileId: definition.id,
      position: [position.x, position.y, position.z],
      direction: [projectileDirection.x, projectileDirection.y, projectileDirection.z],
      sourceFaction: source.faction,
    })
  }

  update(deltaTime: number, obstacles: readonly THREE.Box2[], targets: readonly Damageable[]): void {
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    for (let index = this.recentPaths.length - 1; index >= 0; index--) {
      this.recentPaths[index].remainingSeconds -= elapsed
      if (this.recentPaths[index].remainingSeconds <= 0) this.recentPaths.splice(index, 1)
    }
    for (let index = this.projectiles.length - 1; index >= 0; index--) {
      const projectile = this.projectiles[index]
      if (projectile.arc) {
        projectile.arc.elapsed = Math.min(projectile.arc.duration, projectile.arc.elapsed + elapsed)
        const progress = projectile.arc.elapsed / projectile.arc.duration
        projectile.mesh.position.lerpVectors(projectile.arc.start, projectile.arc.end, progress)
        projectile.mesh.position.y += Math.sin(Math.PI * progress) * projectile.arc.apex
        this.updateTrail(projectile.trail, projectile.mesh.position, projectile.direction, projectile.definition.id)
        if (progress >= 1) {
          this.events?.emit({
            type: 'projectile-impact',
            projectileId: projectile.definition.id,
            position: [projectile.arc.end.x, projectile.arc.end.y, projectile.arc.end.z],
            sourcePosition: [projectile.arc.start.x, projectile.arc.start.y, projectile.arc.start.z],
            sourceFaction: projectile.source.faction,
            targetFaction: 'environment',
          })
          this.removeAt(index)
        }
        continue
      }
      const distance = Math.min(projectile.definition.projectileSpeed * elapsed, projectile.remainingRange)
      if (distance > 0) {
        this.start.set(projectile.mesh.position.x, projectile.mesh.position.z)
        this.end.copy(this.start).addScaledVector(this.segment.set(projectile.direction.x, projectile.direction.z), distance)
        const wallEntry = this.findNearestObstacle(this.start, this.end, obstacles, projectile.definition.projectileRadius)
        const targetHit = this.findNearestTarget(this.start, this.end, targets, projectile)

        if (targetHit && targetHit.entry < (wallEntry ?? Infinity)) {
          const hitPoint = this.start.clone().lerp(this.end, targetHit.entry)
          projectile.mesh.position.set(hitPoint.x, projectile.mesh.position.y, hitPoint.y)
          this.recordDebugPath(projectile)
          const context: DamageContext = {
            sourceId: projectile.source.id,
            sourceFaction: projectile.source.faction,
            amount: projectile.definition.damage,
            type: projectile.definition.damageType,
            sourcePosition: [projectile.origin.x, projectile.origin.y, projectile.origin.z],
            effects: projectile.definition.statusEffects,
          }
          const damaged = this.resolver.apply(targetHit.target, context)
          if (damaged && targetHit.target.faction === 'player') {
            this.events?.emit({ type: 'player-hit-source', position: [projectile.origin.x, projectile.origin.y, projectile.origin.z] })
          }
          this.events?.emit({
            type: 'projectile-impact',
            projectileId: projectile.definition.id,
            position: [hitPoint.x, projectile.mesh.position.y, hitPoint.y],
            sourcePosition: [projectile.origin.x, projectile.origin.y, projectile.origin.z],
            sourceFaction: projectile.source.faction,
            targetFaction: targetHit.target.faction,
          })
          this.applyImpactEffects(projectile, targetHit.target, hitPoint, obstacles, targets)
          this.removeAt(index)
          continue
        }

        if (wallEntry !== null) {
          const hitPoint = this.start.clone().lerp(this.end, wallEntry)
          projectile.mesh.position.set(hitPoint.x, projectile.mesh.position.y, hitPoint.y)
          this.recordDebugPath(projectile)
          this.events?.emit({
            type: 'projectile-impact',
            projectileId: projectile.definition.id,
            position: [hitPoint.x, projectile.mesh.position.y, hitPoint.y],
            sourcePosition: [projectile.origin.x, projectile.origin.y, projectile.origin.z],
            sourceFaction: projectile.source.faction,
            targetFaction: 'environment',
          })
          this.applyImpactEffects(projectile, null, hitPoint, obstacles, targets)
          this.removeAt(index)
          continue
        }

        projectile.mesh.position.set(this.end.x, projectile.mesh.position.y, this.end.y)
        this.recordDebugPath(projectile)
        this.updateTrail(projectile.trail, projectile.mesh.position, projectile.direction, projectile.definition.id)
        projectile.remainingRange -= distance
      }
      if (projectile.remainingRange <= Number.EPSILON) this.removeAt(index)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.recentPaths.length = 0
    while (this.projectiles.length > 0) this.removeAt(this.projectiles.length - 1)
    this.geometry.dispose()
    this.trailGeometry.dispose()
    for (const material of this.materials.values()) material.dispose()
    this.materials.clear()
    for (const material of this.trailMaterials.values()) material.dispose()
    this.trailMaterials.clear()
  }

  private recordDebugPath(projectile: Projectile): void {
    const end = projectile.mesh.position
    this.recentPaths.push({
      start: [this.start.x, end.y, this.start.y], end: [end.x, end.y, end.z],
      faction: projectile.source.faction, remainingSeconds: 0.35,
    })
    if (this.recentPaths.length > 64) this.recentPaths.shift()
  }

  private getMaterial(definition: ProjectileDefinition): THREE.MeshStandardMaterial {
    const existing = this.materials.get(definition.id)
    if (existing) return existing
    const material = new THREE.MeshStandardMaterial({
      color: definition.projectileColor ?? '#c4fff3',
      emissive: definition.projectileEmissive ?? VISUAL_THEME.colors.cyan,
      emissiveIntensity: definition.projectileEmissiveIntensity ?? 2.2,
      roughness: 0.3,
    })
    this.materials.set(definition.id, material)
    return material
  }

  private validateImpactEffects(definition: ProjectileDefinition): void {
    const effects = definition.onImpact
    if (!effects) return
    if (effects.splash && (!Number.isFinite(effects.splash.radius) || effects.splash.radius <= 0 || effects.splash.radius > 12
      || !Number.isFinite(effects.splash.damageMultiplier) || effects.splash.damageMultiplier < 0 || effects.splash.damageMultiplier > 2.5
      || !Number.isSafeInteger(effects.splash.maxTargets) || effects.splash.maxTargets < 1 || effects.splash.maxTargets > 8)) {
      throw new RangeError(`Projectile ${definition.id} has invalid splash effects`)
    }
    if (effects.chain && (!Number.isFinite(effects.chain.range) || effects.chain.range <= 0 || effects.chain.range > 16
      || !Number.isFinite(effects.chain.damageMultiplier) || effects.chain.damageMultiplier < 0 || effects.chain.damageMultiplier > 2.5
      || !Number.isSafeInteger(effects.chain.maxTargets) || effects.chain.maxTargets < 1 || effects.chain.maxTargets > 6)) {
      throw new RangeError(`Projectile ${definition.id} has invalid chain effects`)
    }
  }

  private getTrailMaterial(definition: ProjectileDefinition): THREE.MeshBasicMaterial {
    const existing = this.trailMaterials.get(definition.id)
    if (existing) return existing
    const material = new THREE.MeshBasicMaterial({
      color: definition.projectileEmissive ?? definition.projectileColor ?? VISUAL_THEME.colors.cyan,
      transparent: true,
      opacity: definition.id.includes('plasma') ? 0.98 : 0.9,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      depthWrite: false,
    })
    this.trailMaterials.set(definition.id, material)
    return material
  }

  private updateTrail(trail: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>, position: THREE.Vector3, direction: THREE.Vector3, projectileId: string): void {
    const plasma = projectileId.includes('plasma')
    const length = plasma ? 1.65 : 1.3
    const width = plasma ? 2 : 1.6
    trail.position.copy(position).addScaledVector(direction, -length * 0.5)
    trail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
    trail.scale.set(width, length, width)
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
      const footprint = bounds.footprint
      let entry: number | null
      if (footprint) {
        const cosine = Math.cos(footprint.rotation)
        const sine = Math.sin(footprint.rotation)
        const radiusX = footprint.radiusX + projectile.definition.projectileRadius
        const radiusZ = footprint.radiusZ + projectile.definition.projectileRadius
        const localStart = new THREE.Vector2(
          ((start.x - bounds.x) * cosine - (start.y - bounds.z) * sine) / radiusX,
          ((start.x - bounds.x) * sine + (start.y - bounds.z) * cosine) / radiusZ,
        )
        const localEnd = new THREE.Vector2(
          ((end.x - bounds.x) * cosine - (end.y - bounds.z) * sine) / radiusX,
          ((end.x - bounds.x) * sine + (end.y - bounds.z) * cosine) / radiusZ,
        )
        entry = this.segmentCircleEntry(localStart, localEnd, 0, 0, 1)
      } else {
        entry = this.segmentCircleEntry(start, end, bounds.x, bounds.z, bounds.radius + projectile.definition.projectileRadius)
      }
      if (entry !== null && (nearest === null || entry < nearest.entry)) nearest = { target, entry }
    }
    return nearest
  }

  private applyImpactEffects(
    projectile: Projectile,
    directTarget: Damageable | null,
    impactPoint: THREE.Vector2,
    obstacles: readonly THREE.Box2[],
    targets: readonly Damageable[],
  ): void {
    const effects = projectile.definition.onImpact
    if (!effects) return
    const sourcePosition: readonly [number, number, number] = [impactPoint.x, projectile.mesh.position.y, impactPoint.y]
    if (effects.splash) {
      const candidates = targets
        .filter((target) => target !== directTarget && target.combatId !== projectile.source.id && target.faction !== projectile.source.faction)
        .map((target) => ({ target, bounds: target.getCombatBounds() }))
        .filter(({ bounds }) => Math.hypot(bounds.x - impactPoint.x, bounds.z - impactPoint.y) <= effects.splash!.radius + bounds.radius
          && this.isVisibleFromImpact(impactPoint, bounds.x, bounds.z, obstacles))
        .sort((first, second) => Math.hypot(first.bounds.x - impactPoint.x, first.bounds.z - impactPoint.y) - Math.hypot(second.bounds.x - impactPoint.x, second.bounds.z - impactPoint.y))
        .slice(0, Math.min(8, effects.splash.maxTargets))
      for (const { target } of candidates) this.resolver.apply(target, {
        sourceId: projectile.source.id,
        sourceFaction: projectile.source.faction,
        amount: projectile.definition.damage * effects.splash.damageMultiplier,
        type: projectile.definition.damageType,
        sourcePosition,
        effects: projectile.definition.statusEffects,
      })
    }
    if (effects.chain && directTarget) {
      const visited = new Set([directTarget.combatId, projectile.source.id])
      let origin = directTarget.getCombatBounds()
      for (let bounce = 0; bounce < Math.min(6, Math.max(0, effects.chain.maxTargets - 1)); bounce++) {
        const next = targets
          .filter((target) => !visited.has(target.combatId) && target.faction !== projectile.source.faction)
          .map((target) => ({ target, bounds: target.getCombatBounds() }))
          .filter(({ bounds }) => Math.hypot(bounds.x - origin.x, bounds.z - origin.z) <= effects.chain!.range + bounds.radius
            && this.isVisibleFromImpact(new THREE.Vector2(origin.x, origin.z), bounds.x, bounds.z, obstacles))
          .sort((first, second) => Math.hypot(first.bounds.x - origin.x, first.bounds.z - origin.z) - Math.hypot(second.bounds.x - origin.x, second.bounds.z - origin.z))
        const candidate = next[0]
        if (!candidate) break
        visited.add(candidate.target.combatId)
        this.resolver.apply(candidate.target, {
          sourceId: projectile.source.id,
          sourceFaction: projectile.source.faction,
          amount: projectile.definition.damage * effects.chain.damageMultiplier,
          type: projectile.definition.damageType,
          sourcePosition,
          effects: projectile.definition.statusEffects,
        })
        origin = candidate.bounds
      }
    }
  }

  private isVisibleFromImpact(impactPoint: THREE.Vector2, targetX: number, targetZ: number, obstacles: readonly THREE.Box2[]): boolean {
    const entry = this.findNearestObstacle(impactPoint, new THREE.Vector2(targetX, targetZ), obstacles, 0.02)
    return entry === null || entry >= 0.995
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
    projectile.trail.removeFromParent()
    projectile.trail.geometry.dispose()
    projectile.mesh.removeFromParent()
  }
}