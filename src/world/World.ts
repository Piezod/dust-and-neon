import * as THREE from 'three'
import type { GraphicsQuality } from '../core/GameSettings.types'
import { getGraphicsProfile, VISUAL_THEME } from '../config/visualTheme'
import { WORLD_COLLISION_PROFILES, type WorldObstacleKind } from '../config/collision.config'
import { CAMPAIGN_WORLD_LAYOUTS, type CampaignWorldFeature, type CampaignWorldLayout as CampaignWorldLayoutsValue } from './campaignWorldLayouts'

export interface WorldObstacleDebugRecord {
  readonly id: string
  readonly kind: WorldObstacleKind
  readonly collisionScale: number
  readonly bounds: THREE.Box2
}

export type WorldScenarioId = 'ghost-town' | 'crystal-canyon' | 'red-foundry' | 'spore-swamp' | 'storm-observatory' | 'eclipse-core'

export class World {
  readonly root = new THREE.Group()
  collisionRevision = 0
  private readonly solidObstacles: THREE.Box2[] = []
  private readonly obstacleDebugRecords: WorldObstacleDebugRecord[] = []
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly textures = new Set<THREE.Texture>()
  private readonly crystalLights: THREE.PointLight[] = []
  private readonly qualityLights: { readonly light: THREE.PointLight; readonly intensity: number }[] = []
  private readonly dustParticles: { readonly drift: number; readonly lift: number }[] = []
  private dustPoints: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null
  private effectMultiplier = 1
  private seed = 7241
  private scenario: WorldScenarioId
  private graphicsQuality: GraphicsQuality
  private readonly sand = this.material(VISUAL_THEME.colors.sand)
  private readonly rock = this.material(VISUAL_THEME.colors.earth)
  private readonly rockVariants = [
    this.rock,
    this.material(VISUAL_THEME.colors.rockLight),
    this.material(VISUAL_THEME.colors.rockWarm),
    this.material(VISUAL_THEME.colors.rockShadow),
  ]
  private readonly wood = this.material(VISUAL_THEME.colors.wood)
  private readonly trim = this.material(VISUAL_THEME.colors.parchment)
  private readonly metal = this.material(VISUAL_THEME.colors.metal, 0.65)
  private readonly cactus = this.material(VISUAL_THEME.colors.cactus)
  private readonly glass = this.material(VISUAL_THEME.colors.glass, 0.3, VISUAL_THEME.colors.sandLight, 1.6)
  private readonly crystal = this.material(VISUAL_THEME.colors.cyanDeep, 0.2, VISUAL_THEME.colors.cyan, 1.35)
  private readonly crystalCore = this.material(VISUAL_THEME.colors.alienViolet, 0.15, VISUAL_THEME.colors.alienViolet, 1.7)

  constructor(quality: GraphicsQuality = 'high', scenario: WorldScenarioId = 'ghost-town') {
    this.scenario = scenario
    this.graphicsQuality = quality
    this.buildScenario()
  }

  rebuildScenario(scenario: WorldScenarioId): void {
    this.geometries.forEach((geometry) => geometry.dispose())
    this.geometries.clear()
    this.textures.forEach((texture) => texture.dispose())
    this.textures.clear()
    this.root.clear()
    this.solidObstacles.length = 0
    this.obstacleDebugRecords.length = 0
    this.crystalLights.length = 0
    this.qualityLights.length = 0
    this.dustParticles.length = 0
    this.dustPoints = null
    this.seed = 7241
    this.scenario = scenario
    this.buildScenario()
  }

  private buildScenario(): void {
    this.collisionRevision++
    this.createTerrain()
    if (this.scenario === 'ghost-town') {
      this.createBuilding(-7, -6, 8, 6, 5, true, 'LAST LIGHT', VISUAL_THEME.colors.saloonWall)
      this.createBuilding(7, -9, 5, 5, 3.9, false, 'TRADING CO.', VISUAL_THEME.colors.tradingPostWall)
      this.createBuilding(12, 4, 5, 5, 3.5, false, 'RELAY 07', VISUAL_THEME.colors.relayWall)
    } else if (this.scenario === 'crystal-canyon') {
      this.createMesa(-14, -4, 11)
      this.createMesa(14, 3, 10)
      this.createMesa(0, -19, 8)
      this.createCrystalCluster(-10, -5)
      this.createCrystalCluster(10, -3)
      this.createCrystalCluster(-9, 8)
      this.createCrystalCluster(9, 11)
    } else if (this.scenario === 'red-foundry') {
      this.createBuilding(-8, -8, 9, 7, 6, false, 'RED FOUNDRY', '#75413e')
      this.createBuilding(9, -8, 6, 6, 5, false, 'REACTOR 03', '#5e4545')
      this.createBuilding(11, 9, 6, 5, 4.5, false, 'FURNACE', '#8a4c41')
      for (const positionX of [-14, -11, 4, 7, 14]) {
        const tank = this.mesh(new THREE.CylinderGeometry(0.65, 0.8, 3.2, 8), this.metal, this.root, positionX, 1.6, 3)
        tank.name = `FoundryTank:${positionX}`
        this.addObstacle(tank, 0.9, 'machinery')
      }
    } else this.createCampaignWorld(this.scenario)
    this.createProps()
    this.createAmbientDust()
    this.setGraphicsQuality(this.graphicsQuality)
  }

  get obstacles(): readonly THREE.Box2[] {
    return this.solidObstacles
  }

  get obstacleDebugInfo(): readonly WorldObstacleDebugRecord[] {
    return this.obstacleDebugRecords
  }

  setGraphicsQuality(quality: GraphicsQuality): void {
    this.graphicsQuality = quality
    const profile = getGraphicsProfile(quality)
    this.effectMultiplier = profile.effects
    if (this.dustPoints) {
      this.dustPoints.geometry.setDrawRange(0, profile.dustCount)
      this.dustPoints.visible = profile.dustCount > 0
      this.dustPoints.material.opacity = Math.max(0.3, VISUAL_THEME.scene.dustOpacity * profile.effects)
    }
    for (const entry of this.qualityLights) {
      entry.light.visible = quality !== 'low'
      entry.light.intensity = entry.intensity * profile.effects
    }
  }

  private addObstacle(object: THREE.Object3D, horizontalScale = 1, kind: WorldObstacleKind = 'structure'): void {
    if (WORLD_COLLISION_PROFILES[kind].category === 'decoration') return
    object.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(object)
    const centerX = (bounds.min.x + bounds.max.x) / 2
    const centerZ = (bounds.min.z + bounds.max.z) / 2
    const halfWidth = (bounds.max.x - bounds.min.x) * horizontalScale / 2
    const halfDepth = (bounds.max.z - bounds.min.z) * horizontalScale / 2
    const obstacle = new THREE.Box2(
      new THREE.Vector2(centerX - halfWidth, centerZ - halfDepth),
      new THREE.Vector2(centerX + halfWidth, centerZ + halfDepth),
    )
    this.solidObstacles.push(obstacle)
    this.obstacleDebugRecords.push({ id: object.name || `${kind}-${this.obstacleDebugRecords.length}`, kind, collisionScale: horizontalScale, bounds: obstacle })
  }

  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    return this.seed / 4294967296
  }

  private material(color: string, metalness = 0, emissive = '#000000', emissiveIntensity = 0): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness, emissive, emissiveIntensity, flatShading: true })
    this.materials.add(material)
    return material
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, positionX: number, positionY: number, positionZ: number): THREE.Mesh {
    this.geometries.add(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(positionX, positionY, positionZ)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  private box(parent: THREE.Object3D, material: THREE.Material, width: number, height: number, depth: number, positionX: number, positionY: number, positionZ: number): THREE.Mesh {
    return this.mesh(new THREE.BoxGeometry(width, height, depth), material, parent, positionX, positionY, positionZ)
  }

  private createTerrain(): void {
    const geometry = new THREE.PlaneGeometry(260, 260, 65, 65)
    geometry.rotateX(-Math.PI / 2)
    const positions = geometry.attributes.position
    const colors: number[] = []
    const color = new THREE.Color()
    const campaignLayout = this.getCampaignLayout()
    const groundColor = campaignLayout?.groundColor ?? '#cd8250'
    for (let index = 0; index < positions.count; index++) {
      const positionX = positions.getX(index)
      const positionZ = positions.getZ(index)
      const outsideTown = THREE.MathUtils.smoothstep(Math.hypot(positionX, positionZ), 22, 65)
      positions.setY(index, -0.1 + outsideTown * (Math.sin(positionX * 0.13) * Math.cos(positionZ * 0.11) * 1.5 + this.random() * 0.6))
      color.set(groundColor).multiplyScalar(0.9 + this.random() * 0.2)
      colors.push(color.r, color.g, color.b)
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    const groundMaterial = this.material('#ffffff')
    groundMaterial.vertexColors = true
    const ground = this.mesh(geometry, groundMaterial, this.root, 0, 0, 0)
    ground.castShadow = false
    const road = this.material(campaignLayout?.roadColor ?? (this.scenario === 'red-foundry' ? '#623d3e' : this.scenario === 'crystal-canyon' ? '#9a704e' : VISUAL_THEME.colors.sandLight))
    this.box(this.root, road, 5.5, 0.025, 56, 1, -0.06, 0)
    for (const positionX of [-0.5, 2.5]) this.box(this.root, this.sand, 0.15, 0.03, 55, positionX, -0.04, 0)
    if (campaignLayout) {
      for (const landmark of campaignLayout.outerLandmarks) this.createMesa(landmark.x, landmark.z, landmark.size)
    } else {
      for (let index = 0; index < 17; index++) {
        const angle = index / 17 * Math.PI * 2
        const radius = 43 + this.random() * 18
        this.createMesa(Math.cos(angle) * radius, Math.sin(angle) * radius, 4 + this.random() * 7)
      }
    }
  }

  private createMesa(positionX: number, positionZ: number, size: number): void {
    const group = new THREE.Group()
    group.position.set(positionX, 0, positionZ)
    group.rotation.y = this.random() * Math.PI
    group.name = `Mesa:${positionX.toFixed(1)}:${positionZ.toFixed(1)}`
    this.root.add(group)
    const strata = [VISUAL_THEME.colors.earthDeep, VISUAL_THEME.colors.earth, VISUAL_THEME.colors.sand, VISUAL_THEME.colors.sandLight]
    for (let level = 0; level < 4; level++) {
      const radius = size * (1 - level * 0.15)
      this.mesh(new THREE.CylinderGeometry(radius * 0.8, radius, size * 0.28, 6), this.material(strata[level]), group, 0, size * (0.14 + level * 0.26), 0)
    }
    this.addObstacle(group, 1, 'mesa')
  }

  private createBuilding(positionX: number, positionZ: number, width: number, depth: number, height: number, saloon: boolean, name: string, color: string): void {
    const building = new THREE.Group()
    building.name = `Building:${name}`
    building.position.set(positionX, 0, positionZ)
    this.root.add(building)
    const wall = this.material(color)
    const foundation = this.box(building, this.rock, width + 0.3, 0.35, depth + 0.3, 0, 0.075, 0)
    this.addObstacle(foundation, 1, 'building')
    this.box(building, wall, width, height, depth, 0, height / 2 + 0.2, 0)
    const front = depth / 2 + 0.04
    for (let level = 0.65; level < height; level += 0.48) this.box(building, this.wood, width, 0.035, 0.035, 0, level, front)
    for (const side of [-1, 1]) {
      this.box(building, this.trim, 0.18, height, 0.16, side * (width / 2 - 0.08), height / 2 + 0.2, front)
      this.createWindow(building, side * width * 0.31, 2.35, front)
      this.box(building, this.trim, 0.12, 1.5, 1.2, side * (width / 2 + 0.02), 2.4, -0.7)
      this.box(building, this.glass, 0.14, 1.15, 0.88, side * (width / 2 + 0.04), 2.4, -0.7)
    }
    this.box(building, this.wood, 1.5, 2.6, 0.18, 0, 1.5, front + 0.02)
    if (saloon) {
      for (const side of [-1, 1]) this.box(building, this.trim, 0.64, 1.25, 0.16, side * 0.37, 1.55, front + 0.16)
    } else {
      this.box(building, this.metal, 0.09, 0.09, 0.12, 0.46, 1.4, front + 0.17)
    }
    const roofMaterial = this.material(saloon ? '#425b58' : '#596465', 0.35)
    const slope = 0.32
    const roofDepth = (depth / 2 + 0.45) / Math.cos(slope)
    for (const side of [-1, 1]) {
      const roof = this.box(building, roofMaterial, width + 0.8, 0.18, roofDepth, 0, height + 0.7, side * (depth / 4 + 0.2))
      roof.rotation.x = side * slope
      for (let rib = -width / 2; rib <= width / 2; rib += 0.55) {
        const seam = this.box(building, this.metal, 0.035, 0.06, roofDepth, rib, height + 0.81, side * (depth / 4 + 0.2))
        seam.rotation.x = side * slope
      }
    }
    this.box(building, this.trim, width + 0.35, 0.24, 0.25, 0, height + 0.27, front + 0.12)
    const porchDepth = saloon ? 2 : 1.4
    const porch = this.box(building, this.wood, width + 0.8, 0.22, porchDepth, 0, 0.24, front + porchDepth / 2)
    this.addObstacle(porch, 1, 'porch')
    for (let plank = -width / 2; plank <= width / 2; plank += 0.36) this.box(building, this.trim, 0.025, 0.015, porchDepth, plank, 0.358, front + porchDepth / 2)
    this.box(building, this.trim, 2.4, 0.16, 0.5, 0, 0.02, front + porchDepth + 0.23)
    this.box(building, roofMaterial, width + 0.9, 0.16, porchDepth + 0.4, 0, 3.35, front + porchDepth / 2)
    for (const side of [-1, 1]) this.box(building, this.trim, 0.16, 3.1, 0.16, side * (width / 2 - 0.1), 1.85, front + porchDepth - 0.1)
    const signColor = saloon ? VISUAL_THEME.colors.cyan : name === 'TRADING CO.' ? VISUAL_THEME.colors.magenta : VISUAL_THEME.colors.electricBlue
    this.createSign(building, name, saloon ? 5.7 : 4.3, 0.95, 0, height - 0.15, front + 0.24, signColor)
    if (saloon) {
      this.createSign(building, 'S A L O O N', 3.2, 0.55, 0, 2.93, front + 0.25, VISUAL_THEME.colors.cyan)
      const porchLight = new THREE.PointLight(VISUAL_THEME.colors.lantern, 14, 9, 2)
      porchLight.position.set(0, 2.7, front + 1)
      building.add(porchLight)
      this.qualityLights.push({ light: porchLight, intensity: 14 })
    } else if (name === 'RELAY 07') {
      this.box(building, this.metal, 0.1, 3.6, 0.1, 0.7, height + 2.3, 0)
      for (const level of [height + 3, height + 3.7]) this.box(building, this.trim, 2.4, 0.07, 0.07, 0.7, level, 0)
      this.mesh(new THREE.SphereGeometry(0.14, 8, 6), this.crystal, building, 0.7, height + 4.1, 0)
    }
  }

  private createWindow(parent: THREE.Object3D, positionX: number, positionY: number, positionZ: number): void {
    this.box(parent, this.trim, 1.5, 1.65, 0.12, positionX, positionY, positionZ)
    this.box(parent, this.glass, 1.18, 1.3, 0.14, positionX, positionY, positionZ + 0.03)
    this.box(parent, this.wood, 0.07, 1.3, 0.17, positionX, positionY, positionZ + 0.08)
    this.box(parent, this.wood, 1.18, 0.07, 0.17, positionX, positionY, positionZ + 0.08)
    this.box(parent, this.trim, 1.7, 0.1, 0.3, positionX, positionY - 0.85, positionZ + 0.1)
  }

  private createSign(parent: THREE.Object3D, text: string, width: number, height: number, positionX: number, positionY: number, positionZ: number, color: string): void {
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = 160
    const context = canvas.getContext('2d')!
    context.fillStyle = VISUAL_THEME.colors.metal
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = VISUAL_THEME.colors.parchment
    context.lineWidth = 5
    context.strokeRect(10, 10, 748, 140)
    context.font = 'bold 82px Georgia'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = color
    context.fillText(text, 384, 86, 710)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.textures.add(texture)
    const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: color, emissiveIntensity: 0.9, roughness: 0.8 })
    this.materials.add(material)
    this.box(parent, this.trim, width + 0.18, height + 0.16, 0.16, positionX, positionY, positionZ)
    this.mesh(new THREE.PlaneGeometry(width, height), material, parent, positionX, positionY, positionZ + 0.085)
    const glow = new THREE.PointLight(color, VISUAL_THEME.scene.neonSignLightIntensity, VISUAL_THEME.scene.neonSignLightRange, 2)
    glow.position.set(positionX, positionY, positionZ + 0.75)
    parent.add(glow)
    this.qualityLights.push({ light: glow, intensity: VISUAL_THEME.scene.neonSignLightIntensity })
  }

  private createBarrel(positionX: number, positionZ: number): void {
    const barrel = this.mesh(new THREE.CylinderGeometry(0.37, 0.34, 0.95, 10), this.wood, this.root, positionX, 0.43, positionZ)
    barrel.name = `Barrel:${positionX}:${positionZ}`
    this.addObstacle(barrel, 1, 'barrel')
    for (const height of [0.12, 0.72]) this.mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.085, 10), this.metal, this.root, positionX, height, positionZ)
  }

  private createCactus(positionX: number, positionZ: number, scale: number): void {
    const group = new THREE.Group()
    group.position.set(positionX, 0, positionZ)
    group.scale.setScalar(scale)
    group.rotation.y = this.random() * Math.PI
    group.name = `Cactus:${positionX}:${positionZ}`
    this.root.add(group)
    const trunk = this.mesh(new THREE.CapsuleGeometry(0.23, 1.8, 3, 7), this.cactus, group, 0, 1.05, 0)
    this.addObstacle(trunk, 1, 'cactus')
    for (const side of [-1, 1]) {
      const height = side === -1 ? 0.85 : 1.4
      const arm = this.mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.65, 7), this.cactus, group, side * 0.35, height, 0)
      arm.rotation.z = Math.PI / 2
      this.mesh(new THREE.CapsuleGeometry(0.15, 0.6, 3, 7), this.cactus, group, side * 0.65, height + 0.3, 0)
    }
  }

  private createCrystalCluster(positionX: number, positionZ: number): void {
    const base = this.mesh(new THREE.DodecahedronGeometry(1.05, 0), this.rock, this.root, positionX, 0.1, positionZ)
    base.name = `CrystalBase:${positionX}:${positionZ}`
    base.scale.set(1.5, 0.4, 1.1)
    this.addObstacle(base, 1, 'crystal-base')
    for (let index = 0; index < 5; index++) {
      const angle = index * 2.4
      const radius = index === 0 ? 0 : 0.65
      const height = index === 0 ? 2.8 : 1 + this.random() * 1.1
      const geometry = new THREE.CylinderGeometry(0, 0.34, height, 5, 1)
      const material = index === 0 ? this.crystalCore : this.crystal
      const crystal = this.mesh(geometry, material, this.root, positionX + Math.cos(angle) * radius, height / 2 + 0.1, positionZ + Math.sin(angle) * radius)
      crystal.rotation.set(Math.sin(angle) * 0.23, angle, Math.cos(angle) * 0.23)
    }
    const light = new THREE.PointLight(VISUAL_THEME.colors.cyan, VISUAL_THEME.scene.crystalLightIntensity, VISUAL_THEME.scene.crystalLightRange, 2)
    light.position.set(positionX, 1.2, positionZ)
    this.root.add(light)
    this.crystalLights.push(light)
    this.qualityLights.push({ light, intensity: VISUAL_THEME.scene.crystalLightIntensity })
  }

  private getCampaignLayout(): CampaignWorldLayoutsValue | null {
    return this.scenario === 'spore-swamp' || this.scenario === 'storm-observatory' || this.scenario === 'eclipse-core'
      ? CAMPAIGN_WORLD_LAYOUTS[this.scenario]
      : null
  }

  private createCampaignWorld(scenario: Extract<WorldScenarioId, 'spore-swamp' | 'storm-observatory' | 'eclipse-core'>): void {
    const layout = CAMPAIGN_WORLD_LAYOUTS[scenario]
    for (const feature of layout.features) this.createCampaignFeature(feature)
  }

  private createCampaignFeature(feature: CampaignWorldFeature): void {
    const [positionX, , positionZ] = feature.position
    const [width, height, depth] = feature.size
    const material = this.material(feature.color, feature.kind === 'storm-generator' ? 0.6 : 0.18, feature.color, feature.kind === 'walkway' ? 0.05 : 0.8)
    if (feature.kind === 'walkway') {
      const board = this.box(this.root, material, width, height, depth, positionX, 0.04, positionZ)
      board.name = `Walkway:${feature.id}`
      for (const end of [-1, 1]) {
        const support = this.mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 6), this.rock, this.root, positionX + end * (width / 2 - 0.3), -0.3, positionZ)
        support.name = `WalkwaySupport:${feature.id}:${end}`
      }
      return
    }
    if (feature.kind === 'spore-tree') {
      const trunkHeight = height * 0.68
      const trunk = this.mesh(new THREE.CylinderGeometry(width * 0.22, width * 0.32, trunkHeight, 7), this.wood, this.root, positionX, trunkHeight / 2, positionZ)
      trunk.name = `SporeTreeTrunk:${feature.id}`
      this.addObstacle(trunk, 0.86, 'spore-tree')
      const cap = this.mesh(new THREE.SphereGeometry(width * 0.72, 8, 6), material, this.root, positionX, height * 0.78, positionZ)
      cap.name = `SporeCap:${feature.id}`
      cap.scale.set(1.3, 0.46, 1.15)
      for (const side of [-1, 1]) this.mesh(new THREE.SphereGeometry(width * 0.13, 6, 5), this.crystal, this.root, positionX + side * width * 0.7, height * 0.8, positionZ + width * 0.1)
      const glow = new THREE.PointLight(feature.color, 4.2, 6.5, 2)
      glow.position.set(positionX, height * 0.72, positionZ)
      this.root.add(glow)
      this.qualityLights.push({ light: glow, intensity: 4.2 })
      return
    }
    if (feature.kind === 'spore-cluster') {
      const base = this.mesh(new THREE.DodecahedronGeometry(width * 0.42, 0), this.rock, this.root, positionX, 0.16, positionZ)
      base.name = `SporeBase:${feature.id}`
      base.scale.set(1.4, 0.48, 1.2)
      this.addObstacle(base, 0.9, 'spore-base')
      for (let index = 0; index < 4; index++) {
        const angle = index * Math.PI / 2
        const stalkHeight = height * (index === 0 ? 0.8 : 0.38 + this.random() * 0.25)
        const spore = this.mesh(new THREE.SphereGeometry(width * (index === 0 ? 0.2 : 0.12), 7, 5), material, this.root,
          positionX + Math.cos(angle) * width * 0.45, stalkHeight, positionZ + Math.sin(angle) * width * 0.45)
        spore.name = `SporeGlow:${feature.id}:${index}`
        const stalk = this.mesh(new THREE.CylinderGeometry(width * 0.06, width * 0.08, stalkHeight, 5), this.trim, this.root,
          positionX + Math.cos(angle) * width * 0.45, stalkHeight / 2, positionZ + Math.sin(angle) * width * 0.45)
        stalk.name = `SporeStalk:${feature.id}:${index}`
      }
      return
    }
    if (feature.kind === 'storm-antenna') {
      const base = this.mesh(new THREE.CylinderGeometry(width * 0.8, width, 0.42, 8), this.metal, this.root, positionX, 0.21, positionZ)
      base.name = `StormAntennaBase:${feature.id}`
      this.addObstacle(base, 0.9, 'antenna-base')
      const mast = this.mesh(new THREE.CylinderGeometry(width * 0.12, width * 0.2, height, 8), material, this.root, positionX, height / 2 + 0.35, positionZ)
      mast.name = `StormAntenna:${feature.id}`
      for (const level of [0.55, 0.77, 0.94]) {
        const crossbar = this.box(this.root, this.trim, width * (level === 0.77 ? 2.8 : 1.8), 0.12, 0.12, positionX, height * level, positionZ)
        crossbar.name = `StormAntennaBar:${feature.id}:${level}`
      }
      return
    }
    if (feature.kind === 'storm-generator') {
      const generator = this.box(this.root, material, width, height, depth, positionX, height / 2, positionZ)
      generator.name = `StormGenerator:${feature.id}`
      this.addObstacle(generator, 0.88, 'generator')
      const coil = this.mesh(new THREE.TorusGeometry(width * 0.35, 0.08, 6, 20), this.crystal, this.root, positionX, height * 0.8, positionZ + depth / 2 + 0.04)
      coil.name = `StormCoil:${feature.id}`
      return
    }
    if (feature.kind === 'eclipse-pylon') {
      const pylon = this.mesh(new THREE.CylinderGeometry(width * 0.32, width * 0.58, height, 6), material, this.root, positionX, height / 2, positionZ)
      pylon.name = `EclipsePylon:${feature.id}`
      this.addObstacle(pylon, 0.84, 'eclipse-pylon')
      const ring = this.mesh(new THREE.TorusGeometry(width * 0.72, 0.075, 6, 18), this.crystal, this.root, positionX, height * 0.65, positionZ)
      ring.name = `EclipsePylonRing:${feature.id}`
      ring.rotation.x = Math.PI / 2
      return
    }
    const ring = this.mesh(new THREE.TorusGeometry(width, height, 8, 64), material, this.root, positionX, feature.position[1], positionZ)
    ring.name = `EclipseEnergyRing:${feature.id}`
    ring.rotation.x = Math.PI / 2
  }

  private createProps(): void {
    if (this.scenario === 'ghost-town') {
      for (const [positionX, positionZ] of [[-12, -1], [-11, 0], [-4, -1], [4, -5], [15, 8], [16, 7]]) this.createBarrel(positionX, positionZ)
      for (const [positionX, positionZ] of [[-15, 7], [8, 12], [-16, -12], [18, -6], [-7, 15], [20, 13]]) this.createCrystalCluster(positionX, positionZ)
      for (const [positionX, positionZ, scale] of [[-17, 1, 1.4], [-11, 13, 1.1], [6, 17, 1.3], [18, -13, 1.5], [-2, -17, 1.1], [22, 1, 0.9], [-23, 14, 1.2]]) this.createCactus(positionX, positionZ, scale)
    } else if (this.scenario === 'crystal-canyon') {
      for (const [positionX, positionZ] of [[-16, 10], [15, -12], [0, 15], [-3, -7]]) this.createCrystalCluster(positionX, positionZ)
    } else if (this.scenario === 'red-foundry') {
      for (const [positionX, positionZ] of [[-15, 8], [-3, -12], [15, 10], [1, 13], [-18, -5], [18, -12]]) this.createBarrel(positionX, positionZ)
    }
    const stoneGeometries = [
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.TetrahedronGeometry(1, 0),
      new THREE.OctahedronGeometry(1, 0),
    ]
    const grassMaterial = this.material(VISUAL_THEME.colors.dryGrass)
    const grassGeometry = new THREE.ConeGeometry(0.13, 0.65, 3)
    for (let index = 0; index < 140; index++) {
      const positionX = (this.random() - 0.5) * 75
      const positionZ = (this.random() - 0.5) * 75
      if (Math.abs(positionX - 1) < 3.7 || (positionX > -13 && positionX < -2 && positionZ > -11 && positionZ < 0) || (positionX > 3 && positionX < 11 && positionZ > -13 && positionZ < -3) || (positionX > 8 && positionX < 16 && positionZ > 0 && positionZ < 9)) continue
      const size = 0.15 + this.random() * 0.65
      const rockMaterial = this.rockVariants[Math.floor(this.random() * this.rockVariants.length)]
      const stoneGeometry = stoneGeometries[Math.floor(this.random() * stoneGeometries.length)]
      const stone = this.mesh(stoneGeometry, rockMaterial, this.root, positionX, size * 0.23, positionZ)
      stone.name = `Rock:${index}`
      stone.scale.set(size * 1.4, size * 0.7, size)
      stone.rotation.set(this.random(), this.random() * Math.PI, 0)
      if (size >= 0.7) this.addObstacle(stone, 0.82, 'rock')
      if (index % 3 === 0) {
        for (let blade = 0; blade < 4; blade++) {
          const grass = this.mesh(grassGeometry, grassMaterial, this.root, positionX + 0.6 + blade * 0.09, 0.2, positionZ)
          grass.rotation.z = (blade - 1.5) * 0.3
        }
      }
    }
    for (const [positionX, positionZ] of [[-14, -2], [15, 10], [4, -4]]) {
      const crate = this.box(this.root, this.trim, 0.9, 0.9, 0.9, positionX, 0.4, positionZ)
      crate.name = `Crate:${positionX}:${positionZ}`
      this.addObstacle(crate, 1, 'crate')
      for (const offset of [-0.3, 0.3]) this.box(this.root, this.wood, 0.09, 0.94, 0.94, positionX + offset, 0.4, positionZ)
    }
  }

  update(elapsedTime: number, deltaTime = 1 / 60): void {
    this.crystalLights.forEach((light, index) => {
      light.intensity = (VISUAL_THEME.scene.crystalLightIntensity
        + Math.sin(elapsedTime * 1.8 + index * 1.7) * VISUAL_THEME.scene.crystalPulseAmount) * this.effectMultiplier
    })
    this.crystal.emissiveIntensity = 1.35 + Math.sin(elapsedTime * 1.8) * 0.32
    this.crystalCore.emissiveIntensity = 1.7 + Math.sin(elapsedTime * 1.8 + 0.7) * 0.42
    if (this.dustPoints) this.updateAmbientDust(deltaTime, elapsedTime)
  }

  private createAmbientDust(): void {
    const count = VISUAL_THEME.scene.dustCount
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const color = new THREE.Color()
    for (let index = 0; index < count; index++) {
      positions[index * 3] = (this.random() - 0.5) * 48
      positions[index * 3 + 1] = 0.9 + this.random() * 4.5
      positions[index * 3 + 2] = (this.random() - 0.5) * 48
      color.set(index % 5 === 0 ? VISUAL_THEME.colors.cyan : VISUAL_THEME.colors.parchment)
      colors[index * 3] = color.r
      colors[index * 3 + 1] = color.g
      colors[index * 3 + 2] = color.b
      this.dustParticles.push({ drift: (this.random() - 0.5) * 0.16, lift: 0.04 + this.random() * 0.08 })
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setDrawRange(0, count)
    const material = new THREE.PointsMaterial({
      color: '#ffffff',
      size: VISUAL_THEME.scene.dustSize,
      sizeAttenuation: true,
      transparent: true,
      opacity: VISUAL_THEME.scene.dustOpacity,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    })
    const points = new THREE.Points(geometry, material)
    points.name = 'AmbientDust'
    points.frustumCulled = false
    this.geometries.add(geometry)
    this.materials.add(material)
    this.root.add(points)
    this.dustPoints = points
  }

  private updateAmbientDust(deltaTime: number, elapsedTime: number): void {
    const positions = this.dustPoints?.geometry.getAttribute('position')
    if (!positions) return
    for (let index = 0; index < this.dustParticles.length; index++) {
      const particle = this.dustParticles[index]
      positions.setY(index, positions.getY(index) + particle.lift * deltaTime)
      positions.setX(index, positions.getX(index) + particle.drift * deltaTime + Math.sin(elapsedTime * 0.35 + index) * 0.001 * deltaTime)
      if (positions.getY(index) > 5.4) {
        positions.setY(index, 0.9)
        positions.setX(index, (this.random() - 0.5) * 48)
        positions.setZ(index, (this.random() - 0.5) * 48)
      }
    }
    positions.needsUpdate = true
  }

  dispose(): void {
    this.geometries.forEach((geometry) => geometry.dispose())
    this.materials.forEach((material) => material.dispose())
    this.textures.forEach((texture) => texture.dispose())
  }
}