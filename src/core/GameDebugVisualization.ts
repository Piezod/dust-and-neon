import * as THREE from 'three'
import type { CombatSystem } from '../combat/CombatSystem'
import type { GameEvent, GameEventBus } from '../events/GameEventBus'
import type { EnemyManager } from '../enemies/EnemyManager'
import type { Player } from '../entities/Player'
import type { World } from '../world/World'

export type DebugLayerId = 'world-colliders' | 'enemy-colliders' | 'routes' | 'line-of-sight' | 'effect-origins' | 'projectile-trajectories'

interface DebugLineLayer {
  readonly object: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>
  readonly vertexColors: boolean
}

interface EffectOrigin {
  readonly position: readonly [number, number, number]
  readonly color: THREE.Color
}

export class GameDebugVisualization {
  private readonly worldLines: DebugLineLayer
  private readonly enemyLines: DebugLineLayer
  private readonly routeLines: DebugLineLayer
  private readonly sightLines: DebugLineLayer
  private readonly projectileLines: DebugLineLayer
  private readonly origins: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  private readonly originsGeometry: THREE.BufferGeometry
  private readonly originsPosition = new Float32Array(24 * 3)
  private readonly originsColor = new Float32Array(24 * 3)
  private readonly recentOrigins: EffectOrigin[] = []
  private readonly unsubscribe: () => void
  private readonly enemies: EnemyManager
  private readonly player: Player
  private readonly combat: CombatSystem

  constructor(scene: THREE.Scene, world: World, enemies: EnemyManager, player: Player, combat: CombatSystem, events: GameEventBus) {
    this.enemies = enemies
    this.player = player
    this.combat = combat
    this.worldLines = this.createLineLayer(scene, 'DebugWorldColliders', '#ffffff', true)
    this.enemyLines = this.createLineLayer(scene, 'DebugEnemyColliders', '#ff5265')
    this.routeLines = this.createLineLayer(scene, 'DebugEnemyRoutes', '#43e0c3')
    this.sightLines = this.createLineLayer(scene, 'DebugEnemyLineOfSight', '#ffffff', true)
    this.projectileLines = this.createLineLayer(scene, 'DebugProjectilePaths', '#dc4fae', true)
    const worldLines = this.createWorldColliderLines(world)
    this.writeLines(this.worldLines, worldLines.positions, worldLines.colors)
    this.originsGeometry = new THREE.BufferGeometry()
    this.originsGeometry.setAttribute('position', new THREE.BufferAttribute(this.originsPosition, 3).setUsage(THREE.DynamicDrawUsage))
    this.originsGeometry.setAttribute('color', new THREE.BufferAttribute(this.originsColor, 3).setUsage(THREE.DynamicDrawUsage))
    this.originsGeometry.setDrawRange(0, 0)
    this.origins = new THREE.Points(this.originsGeometry, new THREE.PointsMaterial({
      size: 9,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }))
    this.origins.name = 'DebugEffectOrigins'
    this.origins.frustumCulled = false
    this.origins.visible = false
    scene.add(this.origins)
    this.unsubscribe = events.subscribe((event) => this.recordOrigin(event))
  }

  setLayer(layer: DebugLayerId, visible: boolean): void {
    this.getLayer(layer).visible = visible
  }

  update(): void {
    const alive = this.enemies.getAlive()
    if (this.enemyLines.object.visible) this.writeEnemyColliders(alive)
    if (this.routeLines.object.visible) this.writeRoutes(alive)
    if (this.sightLines.object.visible) this.writeLineOfSight(alive)
    if (this.projectileLines.object.visible) this.writeProjectilePaths()
    if (this.origins.visible) this.writeOrigins()
  }

  dispose(): void {
    this.unsubscribe()
    for (const layer of [this.worldLines, this.enemyLines, this.routeLines, this.sightLines, this.projectileLines]) {
      layer.object.removeFromParent()
      layer.object.geometry.dispose()
      layer.object.material.dispose()
    }
    this.origins.removeFromParent()
    this.origins.geometry.dispose()
    this.origins.material.dispose()
    this.recentOrigins.length = 0
  }

  private createLineLayer(scene: THREE.Scene, name: string, color: string, vertexColors = false): DebugLineLayer {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3).setUsage(THREE.DynamicDrawUsage))
    if (vertexColors) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3).setUsage(THREE.DynamicDrawUsage))
    const material = new THREE.LineBasicMaterial({
      color,
      vertexColors,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    const object = new THREE.LineSegments(geometry, material)
    object.name = name
    object.frustumCulled = false
    object.renderOrder = 20
    object.visible = false
    scene.add(object)
    return { object, vertexColors }
  }

  private createWorldColliderLines(world: World): { readonly positions: number[]; readonly colors: number[] } {
    const positions: number[] = []
    const colors: number[] = []
    for (const record of world.obstacleDebugInfo) {
      const obstacle = record.bounds
      const color = new THREE.Color(record.kind === 'rock' ? '#f05a62' : record.kind === 'crystal-base' ? '#a74ee8' : '#ffcc75')
      const minX = obstacle.min.x
      const maxX = obstacle.max.x
      const minZ = obstacle.min.y
      const maxZ = obstacle.max.y
      const bottom = 0.04
      const top = 0.68
      const corners = [
        [minX, bottom, minZ], [maxX, bottom, minZ], [maxX, bottom, maxZ], [minX, bottom, maxZ],
        [minX, top, minZ], [maxX, top, minZ], [maxX, top, maxZ], [minX, top, maxZ],
      ]
      for (const [first, second] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
        positions.push(...corners[first], ...corners[second])
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
      }
    }
    return { positions, colors }
  }

  private writeEnemyColliders(enemies: readonly import('../enemies/Enemy').Enemy[]): void {
    const positions: number[] = []
    for (const enemy of enemies) {
      const bounds = enemy.getCombatBounds()
      for (let index = 0; index < 20; index++) {
        const firstAngle = index * Math.PI * 2 / 20
        const secondAngle = (index + 1) * Math.PI * 2 / 20
        positions.push(
          bounds.x + Math.cos(firstAngle) * bounds.radius, 0.035, bounds.z + Math.sin(firstAngle) * bounds.radius,
          bounds.x + Math.cos(secondAngle) * bounds.radius, 0.035, bounds.z + Math.sin(secondAngle) * bounds.radius,
        )
      }
    }
    this.writeLines(this.enemyLines, positions)
  }

  private writeRoutes(enemies: readonly import('../enemies/Enemy').Enemy[]): void {
    const positions: number[] = []
    for (const enemy of enemies) {
      const points = [enemy.root.position, ...enemy.navigationWaypoints]
      for (let index = 1; index < points.length; index++) {
        const first = points[index - 1]
        const second = points[index]
        positions.push(first.x, 0.06, first.z, second.x, 0.06, second.z)
        positions.push(second.x, 0.06, second.z, second.x, 0.35, second.z)
      }
    }
    this.writeLines(this.routeLines, positions)
  }

  private writeLineOfSight(enemies: readonly import('../enemies/Enemy').Enemy[]): void {
    const positions: number[] = []
    const colors: number[] = []
    for (const enemy of enemies) {
      const origin = enemy.root.position
      const start = [origin.x, enemy.definition.visual.bodyHeight * 0.6, origin.z] as const
      const end = [this.player.position.x, 0.95, this.player.position.z] as const
      const color = new THREE.Color(enemy.hasLineOfSightToTarget ? '#43e0c3' : '#f05a62')
      positions.push(...start, ...end)
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
    }
    this.writeLines(this.sightLines, positions, colors)
  }

  private writeProjectilePaths(): void {
    const positions: number[] = []
    const colors: number[] = []
    for (const projectile of this.combat.getDebugProjectilePaths()) {
      positions.push(...projectile.start, ...projectile.end)
      const color = new THREE.Color(projectile.faction === 'player' ? '#43e0c3' : '#a74ee8')
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
    }
    this.writeLines(this.projectileLines, positions, colors)
  }

  private writeLines(layer: DebugLineLayer, values: number[], colorValues?: number[]): void {
    const position = this.ensureAttribute(layer.object.geometry, 'position', values.length)
    position.array.set(values)
    position.needsUpdate = true
    layer.object.geometry.setDrawRange(0, values.length / 3)
    if (layer.vertexColors && colorValues) {
      const color = this.ensureAttribute(layer.object.geometry, 'color', colorValues.length)
      color.array.set(colorValues)
      color.needsUpdate = true
    }
  }

  private ensureAttribute(geometry: THREE.BufferGeometry, name: string, required: number): THREE.BufferAttribute {
    let attribute = geometry.getAttribute(name) as THREE.BufferAttribute | undefined
    if (!attribute || attribute.array.length < required) {
      const capacity = Math.max(required, (attribute?.array.length ?? 0) * 2, 48)
      attribute = new THREE.BufferAttribute(new Float32Array(capacity), 3).setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute(name, attribute)
    }
    return attribute
  }

  private recordOrigin(event: GameEvent): void {
    const position = this.eventPosition(event)
    if (!position) return
    const color = event.type === 'enemy-killed' || event.type === 'player-damaged'
      ? '#f05a62'
      : event.type === 'projectile-impact' && event.projectileId.includes('plasma') ? '#a74ee8' : '#43e0c3'
    this.recentOrigins.push({ position, color: new THREE.Color(color) })
    if (this.recentOrigins.length > 24) this.recentOrigins.shift()
  }

  private eventPosition(event: GameEvent): readonly [number, number, number] | null {
    switch (event.type) {
      case 'player-shot':
      case 'enemy-spawned':
      case 'enemy-attacked':
      case 'enemy-damaged':
      case 'dash-activated':
      case 'player-moved':
      case 'player-damaged':
      case 'loot-collected':
      case 'projectile-impact':
      case 'debug-effect-requested':
        return event.position
      case 'enemy-killed':
        return event.death.position
      default:
        return null
    }
  }

  private writeOrigins(): void {
    const count = this.recentOrigins.length
    for (let index = 0; index < count; index++) {
      const origin = this.recentOrigins[index]
      this.originsPosition.set(origin.position, index * 3)
      this.originsColor[index * 3] = origin.color.r
      this.originsColor[index * 3 + 1] = origin.color.g
      this.originsColor[index * 3 + 2] = origin.color.b
    }
    const positions = this.origins.geometry.getAttribute('position') as THREE.BufferAttribute
    const colors = this.origins.geometry.getAttribute('color') as THREE.BufferAttribute
    positions.needsUpdate = true
    colors.needsUpdate = true
    this.origins.geometry.setDrawRange(0, count)
  }

  private getLayer(layer: DebugLayerId): THREE.Object3D {
    switch (layer) {
      case 'world-colliders': return this.worldLines.object
      case 'enemy-colliders': return this.enemyLines.object
      case 'routes': return this.routeLines.object
      case 'line-of-sight': return this.sightLines.object
      case 'effect-origins': return this.origins
      case 'projectile-trajectories': return this.projectileLines.object
    }
  }
}
