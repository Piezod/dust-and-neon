import * as THREE from 'three'
import type { CombatSystem } from '../combat/CombatSystem'
import type { DamageContext, DamageStatusApplication, DamageType } from '../combat/Combat.types'
import type { Damageable } from '../combat/Damageable'
import { hasLineOfSight, isNavigationPointClear } from './EnemyNavigation'

export interface EnemyZoneDefinition {
  readonly ownerId: string
  readonly center: THREE.Vector3
  readonly radius: number
  readonly warningSeconds: number
  readonly activeSeconds: number
  readonly tickIntervalSeconds: number
  readonly damage: number
  readonly damageType: DamageType
  readonly statusEffects?: readonly DamageStatusApplication[]
  readonly color: string
  readonly persistAfterOwnerDeath?: boolean
}

export interface EnemyArcLinkDefinition {
  readonly ownerId: string
  readonly start: THREE.Vector3
  readonly end: THREE.Vector3
  readonly warningSeconds: number
  readonly activeSeconds: number
  readonly tickIntervalSeconds: number
  readonly width: number
  readonly damage: number
  readonly damageType: DamageType
  readonly statusEffects?: readonly DamageStatusApplication[]
  readonly color: string
  readonly nodeHealth: number
}

const MAX_HAZARDS = 16
const MAX_HAZARDS_PER_OWNER = 4
const MAX_CATCH_UP_TICKS = 4

interface Hazard {
  readonly id: string
  readonly ownerId: string
  readonly root: THREE.Group
  readonly geometries: THREE.BufferGeometry[]
  readonly materials: THREE.Material[]
  readonly persistAfterOwnerDeath: boolean
  readonly update: (deltaTime: number, targets: readonly Damageable[]) => boolean
  readonly dispose: () => void
}

class ArcNode implements Damageable {
  readonly faction = 'enemies'
  readonly root: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  private health: number
  private readonly maxHealth: number
  private readonly remove: () => void
  private removed = false

  constructor(id: string, position: THREE.Vector3, health: number, color: string, remove: () => void) {
    this.combatId = id
    this.health = health
    this.maxHealth = health
    this.remove = remove
    const geometry = new THREE.SphereGeometry(0.28, 8, 6)
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.7, roughness: 0.35 })
    this.root = new THREE.Mesh(geometry, material)
    this.root.name = `ArcNode:${id}`
    this.root.position.copy(position)
    this.root.position.y = 0.42
  }

  readonly combatId: string

  getCombatBounds(): { readonly x: number; readonly z: number; readonly radius: number } {
    return { x: this.root.position.x, z: this.root.position.z, radius: 0.34 }
  }

  applyDamage(context: DamageContext): void {
    if (this.removed || context.sourceFaction !== 'player' || !Number.isFinite(context.amount) || context.amount <= 0) return
    this.health = Math.max(0, this.health - context.amount)
    const ratio = this.health / this.maxHealth
    this.root.scale.setScalar(Math.max(0.35, ratio))
    if (this.health === 0) this.removeOnce()
  }

  dispose(): void {
    this.removeOnce()
  }

  private removeOnce(): void {
    if (this.removed) return
    this.removed = true
    this.remove()
    this.root.removeFromParent()
    this.root.geometry.dispose()
    this.root.material.dispose()
  }
}

export class EnemyHazardManager {
  private readonly scene: THREE.Object3D
  private readonly obstacles: readonly THREE.Box2[]
  private readonly combat: CombatSystem
  private readonly hazards = new Map<string, Hazard>()
  private readonly ownerLimits = new Map<string, number>()
  private sequence = 0

  constructor(scene: THREE.Object3D, obstacles: readonly THREE.Box2[], combat: CombatSystem) {
    this.scene = scene
    this.obstacles = obstacles
    this.combat = combat
  }

  get activeCount(): number {
    return this.hazards.size
  }

  get activeOwnerCount(): number {
    return new Set(Array.from(this.hazards.values(), (hazard) => hazard.ownerId)).size
  }

  setOwnerLimit(ownerId: string, maximum: number): void {
    if (!ownerId || !Number.isSafeInteger(maximum) || maximum < 0 || maximum > MAX_HAZARDS_PER_OWNER) throw new RangeError('Invalid hazard owner limit')
    this.ownerLimits.set(ownerId, maximum)
  }

  createZone(definition: EnemyZoneDefinition): string | null {
    if (!this.canAdd(definition.ownerId) || !this.isValidZone(definition)) return null
    const id = this.nextId(definition.ownerId)
    const root = new THREE.Group()
    root.name = `EnemyHazard:${definition.ownerId}:${id}`
    const geometry = new THREE.RingGeometry(0.88, 1, 40)
    geometry.rotateX(-Math.PI / 2)
    const material = new THREE.MeshBasicMaterial({ color: definition.color, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false })
    const ring = new THREE.Mesh(geometry, material)
    ring.position.set(definition.center.x, 0.08, definition.center.z)
    ring.scale.setScalar(definition.radius)
    ring.renderOrder = 8
    root.add(ring)
    this.scene.add(root)
    let delay = Math.min(8, definition.warningSeconds)
    let active = Math.min(12, definition.activeSeconds)
    let tick = 0
    const update = (elapsed: number, targets: readonly Damageable[]): boolean => {
      if (delay > 0) {
        delay = Math.max(0, delay - elapsed)
        material.opacity = 0.22 + 0.22 * (1 - delay / Math.max(0.001, definition.warningSeconds))
        return false
      }
      active = Math.max(0, active - elapsed)
      tick -= elapsed
      let count = 0
      while (tick <= 1e-8 && active > 0 && count++ < MAX_CATCH_UP_TICKS) {
        for (const target of targets) {
          const bounds = target.getCombatBounds()
          if (Math.hypot(bounds.x - definition.center.x, bounds.z - definition.center.z) > definition.radius + bounds.radius) continue
          if (!hasLineOfSight(definition.center, new THREE.Vector3(bounds.x, 0, bounds.z), this.obstacles)) continue
          this.combat.applyDamage(target, {
            sourceId: definition.ownerId,
            sourceFaction: 'enemies',
            amount: definition.damage,
            type: definition.damageType,
            effects: definition.statusEffects,
            sourcePosition: [definition.center.x, 0.1, definition.center.z],
          })
        }
        tick += definition.tickIntervalSeconds
      }
      material.opacity = 0.5 + Math.sin(active * 5) * 0.08
      return active <= 0
    }
    this.hazards.set(id, this.createHazardRecord(id, definition.ownerId, root, [geometry], [material], update, () => undefined, definition.persistAfterOwnerDeath ?? false))
    return id
  }

  createArcLink(definition: EnemyArcLinkDefinition): string | null {
    if (!this.canAdd(definition.ownerId) || !this.isValidLink(definition)) return null
    if (!hasLineOfSight(definition.start, definition.end, this.obstacles)) return null
    const id = this.nextId(definition.ownerId)
    const root = new THREE.Group()
    root.name = `EnemyArcLink:${definition.ownerId}:${id}`
    const points = [definition.start.x, 0.12, definition.start.z, definition.end.x, 0.12, definition.end.z]
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    const lineMaterial = new THREE.LineBasicMaterial({ color: definition.color, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, toneMapped: false })
    const line = new THREE.Line(lineGeometry, lineMaterial)
    line.renderOrder = 9
    root.add(line)
    const nodes: ArcNode[] = []
    const removeNode = (node: ArcNode): void => {
      this.combat.unregisterTarget(node.combatId)
      nodes.splice(nodes.indexOf(node), 1)
    }
    for (const [index, position] of [definition.start, definition.end].entries()) {
      const node = new ArcNode(`${id}:node:${index}`, position, definition.nodeHealth, definition.color, () => removeNode(node))
      root.add(node.root)
      nodes.push(node)
      this.combat.registerTarget(node)
    }
    this.scene.add(root)
    let delay = Math.min(8, definition.warningSeconds)
    let active = Math.min(12, definition.activeSeconds)
    let tick = 0
    const update = (elapsed: number, targets: readonly Damageable[]): boolean => {
      if (nodes.length < 2) return true
      if (delay > 0) {
        delay = Math.max(0, delay - elapsed)
        lineMaterial.opacity = 0.18 + 0.62 * (1 - delay / Math.max(0.001, definition.warningSeconds))
        return false
      }
      active = Math.max(0, active - elapsed)
      tick -= elapsed
      let count = 0
      while (tick <= 1e-8 && active > 0 && count++ < MAX_CATCH_UP_TICKS) {
        const start = nodes[0].root.position
        const end = nodes[1].root.position
        for (const target of targets) {
          const bounds = target.getCombatBounds()
          if (distanceToSegment(bounds.x, bounds.z, start.x, start.z, end.x, end.z) > definition.width + bounds.radius) continue
          if (!hasLineOfSight(start, new THREE.Vector3(bounds.x, 0, bounds.z), this.obstacles)) continue
          this.combat.applyDamage(target, {
            sourceId: definition.ownerId,
            sourceFaction: 'enemies',
            amount: definition.damage,
            type: definition.damageType,
            effects: definition.statusEffects,
            sourcePosition: [start.x, 0.2, start.z],
          })
        }
        tick += definition.tickIntervalSeconds
      }
      lineMaterial.opacity = 0.7 + Math.sin(active * 7) * 0.14
      return active <= 0
    }
    const hazard = this.createHazardRecord(id, definition.ownerId, root, [lineGeometry], [lineMaterial], update, () => {
      for (const node of [...nodes]) node.dispose()
    })
    this.hazards.set(id, hazard)
    return id
  }

  update(deltaTime: number, targets: readonly Damageable[]): void {
    const elapsed = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0
    for (const [id, hazard] of this.hazards) {
      if (!hazard.update(elapsed, targets)) continue
      this.hazards.delete(id)
      hazard.dispose()
    }
  }

  removeOwner(ownerId: string): void {
    for (const [id, hazard] of this.hazards) {
      if (hazard.ownerId !== ownerId || hazard.persistAfterOwnerDeath) continue
      this.hazards.delete(id)
      hazard.dispose()
    }
    this.ownerLimits.delete(ownerId)
  }

  clear(): void {
    for (const hazard of this.hazards.values()) hazard.dispose()
    this.hazards.clear()
    this.ownerLimits.clear()
  }

  dispose(): void {
    this.clear()
  }

  private canAdd(ownerId: string): boolean {
    if (this.hazards.size >= MAX_HAZARDS) return false
    const owned = Array.from(this.hazards.values()).filter((hazard) => hazard.ownerId === ownerId).length
    return owned < (this.ownerLimits.get(ownerId) ?? MAX_HAZARDS_PER_OWNER)
  }

  private isValidZone(definition: EnemyZoneDefinition): boolean {
    return definition.ownerId.length > 0 && Number.isFinite(definition.radius) && definition.radius > 0 && definition.radius <= 12
      && Number.isFinite(definition.warningSeconds) && definition.warningSeconds >= 0
      && Number.isFinite(definition.activeSeconds) && definition.activeSeconds > 0 && definition.activeSeconds <= 12
      && Number.isFinite(definition.tickIntervalSeconds) && definition.tickIntervalSeconds >= 0.12 && definition.tickIntervalSeconds <= 4
      && Number.isFinite(definition.damage) && definition.damage >= 0 && definition.damage <= 200
  }

  private isValidLink(definition: EnemyArcLinkDefinition): boolean {
    return definition.ownerId.length > 0 && Number.isFinite(definition.nodeHealth) && definition.nodeHealth > 0 && definition.nodeHealth <= 500
      && Number.isFinite(definition.width) && definition.width > 0 && definition.width <= 2
      && Number.isFinite(definition.warningSeconds) && definition.warningSeconds >= 0
      && Number.isFinite(definition.activeSeconds) && definition.activeSeconds > 0 && definition.activeSeconds <= 12
      && Number.isFinite(definition.tickIntervalSeconds) && definition.tickIntervalSeconds >= 0.12 && definition.tickIntervalSeconds <= 4
      && Number.isFinite(definition.damage) && definition.damage >= 0 && definition.damage <= 200
      && isNavigationPointClear(definition.start, this.obstacles, 0.35)
      && isNavigationPointClear(definition.end, this.obstacles, 0.35)
  }

  private createHazardRecord(
    id: string,
    ownerId: string,
    root: THREE.Group,
    geometries: THREE.BufferGeometry[],
    materials: THREE.Material[],
    update: Hazard['update'],
    cleanup = (): void => undefined,
    persistAfterOwnerDeath = false,
  ): Hazard {
    let disposed = false
    return {
      id, ownerId, root, geometries, materials, update, persistAfterOwnerDeath,
      dispose: () => {
        if (disposed) return
        disposed = true
        cleanup()
        for (const geometry of geometries) geometry.dispose()
        for (const material of materials) material.dispose()
        root.removeFromParent()
      },
    }
  }

  private nextId(ownerId: string): string {
    return `${ownerId}:hazard:${++this.sequence}`
  }
}

function distanceToSegment(x: number, z: number, startX: number, startZ: number, endX: number, endZ: number): number {
  const dx = endX - startX
  const dz = endZ - startZ
  const lengthSquared = dx * dx + dz * dz
  const amount = lengthSquared === 0 ? 0 : THREE.MathUtils.clamp(((x - startX) * dx + (z - startZ) * dz) / lengthSquared, 0, 1)
  return Math.hypot(x - (startX + dx * amount), z - (startZ + dz * amount))
}
