import * as THREE from 'three'

export class World {
  readonly root = new THREE.Group()
  private readonly solidObstacles: THREE.Box2[] = []
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly textures = new Set<THREE.Texture>()
  private readonly crystalLights: THREE.PointLight[] = []
  private seed = 7241
  private readonly sand = this.material('#cd8250')
  private readonly rock = this.material('#a7563d')
  private readonly wood = this.material('#63443b')
  private readonly trim = this.material('#c59a69')
  private readonly metal = this.material('#3c5555', 0.65)
  private readonly cactus = this.material('#537c60')
  private readonly glass = this.material('#f8c46a', 0.3, '#ffb444', 1.6)
  private readonly crystal = this.material('#087f78', 0.2, '#00c6a9', 0.8)

  constructor() {
    this.createTerrain()
    this.createBuilding(-7, -6, 8, 6, 5, true, 'LAST LIGHT', '#805044')
    this.createBuilding(7, -9, 5, 5, 3.9, false, 'TRADING CO.', '#a47558')
    this.createBuilding(12, 4, 5, 5, 3.5, false, 'RELAY 07', '#617878')
    this.createProps()
  }

  get obstacles(): readonly THREE.Box2[] {
    return this.solidObstacles
  }

  private addObstacle(object: THREE.Object3D): void {
    object.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(object)
    this.solidObstacles.push(new THREE.Box2(
      new THREE.Vector2(bounds.min.x, bounds.min.z),
      new THREE.Vector2(bounds.max.x, bounds.max.z),
    ))
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
    for (let index = 0; index < positions.count; index++) {
      const positionX = positions.getX(index)
      const positionZ = positions.getZ(index)
      const outsideTown = THREE.MathUtils.smoothstep(Math.hypot(positionX, positionZ), 22, 65)
      positions.setY(index, -0.1 + outsideTown * (Math.sin(positionX * 0.13) * Math.cos(positionZ * 0.11) * 1.5 + this.random() * 0.6))
      color.set('#cd8250').multiplyScalar(0.9 + this.random() * 0.2)
      colors.push(color.r, color.g, color.b)
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    const groundMaterial = this.material('#ffffff')
    groundMaterial.vertexColors = true
    const ground = this.mesh(geometry, groundMaterial, this.root, 0, 0, 0)
    ground.castShadow = false
    const road = this.material('#db9961')
    this.box(this.root, road, 5.5, 0.025, 56, 1, -0.06, 0)
    for (const positionX of [-0.5, 2.5]) this.box(this.root, this.sand, 0.15, 0.03, 55, positionX, -0.04, 0)
    for (let index = 0; index < 17; index++) {
      const angle = index / 17 * Math.PI * 2
      const radius = 43 + this.random() * 18
      this.createMesa(Math.cos(angle) * radius, Math.sin(angle) * radius, 4 + this.random() * 7)
    }
  }

  private createMesa(positionX: number, positionZ: number, size: number): void {
    const group = new THREE.Group()
    group.position.set(positionX, 0, positionZ)
    group.rotation.y = this.random() * Math.PI
    this.root.add(group)
    const strata = ['#9a513f', '#b56849', '#cd8257', '#dd9c65']
    for (let level = 0; level < 4; level++) {
      const radius = size * (1 - level * 0.15)
      this.mesh(new THREE.CylinderGeometry(radius * 0.8, radius, size * 0.28, 6), this.material(strata[level]), group, 0, size * (0.14 + level * 0.26), 0)
    }
    this.addObstacle(group)
  }

  private createBuilding(positionX: number, positionZ: number, width: number, depth: number, height: number, saloon: boolean, name: string, color: string): void {
    const building = new THREE.Group()
    building.position.set(positionX, 0, positionZ)
    this.root.add(building)
    const wall = this.material(color)
    const foundation = this.box(building, this.rock, width + 0.3, 0.35, depth + 0.3, 0, 0.075, 0)
    this.addObstacle(foundation)
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
    this.addObstacle(porch)
    for (let plank = -width / 2; plank <= width / 2; plank += 0.36) this.box(building, this.trim, 0.025, 0.015, porchDepth, plank, 0.358, front + porchDepth / 2)
    this.box(building, this.trim, 2.4, 0.16, 0.5, 0, 0.02, front + porchDepth + 0.23)
    this.box(building, roofMaterial, width + 0.9, 0.16, porchDepth + 0.4, 0, 3.35, front + porchDepth / 2)
    for (const side of [-1, 1]) this.box(building, this.trim, 0.16, 3.1, 0.16, side * (width / 2 - 0.1), 1.85, front + porchDepth - 0.1)
    this.createSign(building, name, saloon ? 5.7 : 4.3, 0.95, 0, height - 0.15, front + 0.24)
    if (saloon) {
      this.createSign(building, 'S A L O O N', 3.2, 0.55, 0, 2.93, front + 0.25)
      const porchLight = new THREE.PointLight('#ffbe65', 14, 9, 2)
      porchLight.position.set(0, 2.7, front + 1)
      building.add(porchLight)
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

  private createSign(parent: THREE.Object3D, text: string, width: number, height: number, positionX: number, positionY: number, positionZ: number): void {
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = 160
    const context = canvas.getContext('2d')!
    context.fillStyle = '#243d3c'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#b1ccb3'
    context.lineWidth = 5
    context.strokeRect(10, 10, 748, 140)
    context.font = 'bold 82px Georgia'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#a1ffe1'
    context.fillText(text, 384, 86, 710)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.textures.add(texture)
    const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: '#7de5c4', emissiveIntensity: 0.6, roughness: 0.8 })
    this.materials.add(material)
    this.box(parent, this.trim, width + 0.18, height + 0.16, 0.16, positionX, positionY, positionZ)
    this.mesh(new THREE.PlaneGeometry(width, height), material, parent, positionX, positionY, positionZ + 0.085)
  }

  private createBarrel(positionX: number, positionZ: number): void {
    const barrel = this.mesh(new THREE.CylinderGeometry(0.37, 0.34, 0.95, 10), this.wood, this.root, positionX, 0.43, positionZ)
    this.addObstacle(barrel)
    for (const height of [0.12, 0.72]) this.mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.085, 10), this.metal, this.root, positionX, height, positionZ)
  }

  private createCactus(positionX: number, positionZ: number, scale: number): void {
    const group = new THREE.Group()
    group.position.set(positionX, 0, positionZ)
    group.scale.setScalar(scale)
    group.rotation.y = this.random() * Math.PI
    this.root.add(group)
    const trunk = this.mesh(new THREE.CapsuleGeometry(0.23, 1.8, 3, 7), this.cactus, group, 0, 1.05, 0)
    this.addObstacle(trunk)
    for (const side of [-1, 1]) {
      const height = side === -1 ? 0.85 : 1.4
      const arm = this.mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.65, 7), this.cactus, group, side * 0.35, height, 0)
      arm.rotation.z = Math.PI / 2
      this.mesh(new THREE.CapsuleGeometry(0.15, 0.6, 3, 7), this.cactus, group, side * 0.65, height + 0.3, 0)
    }
  }

  private createCrystalCluster(positionX: number, positionZ: number): void {
    const base = this.mesh(new THREE.DodecahedronGeometry(1.05, 0), this.rock, this.root, positionX, 0.1, positionZ)
    base.scale.set(1.5, 0.4, 1.1)
    this.addObstacle(base)
    for (let index = 0; index < 5; index++) {
      const angle = index * 2.4
      const radius = index === 0 ? 0 : 0.65
      const height = index === 0 ? 2.8 : 1 + this.random() * 1.1
      const geometry = new THREE.CylinderGeometry(0, 0.34, height, 5, 1)
      const crystal = this.mesh(geometry, this.crystal, this.root, positionX + Math.cos(angle) * radius, height / 2 + 0.1, positionZ + Math.sin(angle) * radius)
      crystal.rotation.set(Math.sin(angle) * 0.23, angle, Math.cos(angle) * 0.23)
    }
    const light = new THREE.PointLight('#23ffd9', 18, 8, 2)
    light.position.set(positionX, 1.2, positionZ)
    this.root.add(light)
    this.crystalLights.push(light)
  }

  private createProps(): void {
    for (const [positionX, positionZ] of [[-12, -1], [-11, 0], [-4, -1], [4, -5], [15, 8], [16, 7]]) this.createBarrel(positionX, positionZ)
    for (const [positionX, positionZ] of [[-15, 7], [8, 12], [-16, -12], [18, -6], [-7, 15], [20, 13]]) this.createCrystalCluster(positionX, positionZ)
    for (const [positionX, positionZ, scale] of [[-17, 1, 1.4], [-11, 13, 1.1], [6, 17, 1.3], [18, -13, 1.5], [-2, -17, 1.1], [22, 1, 0.9], [-23, 14, 1.2]]) this.createCactus(positionX, positionZ, scale)
    const stoneGeometry = new THREE.DodecahedronGeometry(1, 0)
    const grassMaterial = this.material('#b4a16d')
    const grassGeometry = new THREE.ConeGeometry(0.13, 0.65, 3)
    for (let index = 0; index < 140; index++) {
      const positionX = (this.random() - 0.5) * 75
      const positionZ = (this.random() - 0.5) * 75
      if (Math.abs(positionX - 1) < 3.7 || (positionX > -13 && positionX < -2 && positionZ > -11 && positionZ < 0) || (positionX > 3 && positionX < 11 && positionZ > -13 && positionZ < -3) || (positionX > 8 && positionX < 16 && positionZ > 0 && positionZ < 9)) continue
      const size = 0.15 + this.random() * 0.65
      const stone = this.mesh(stoneGeometry, this.rock, this.root, positionX, size * 0.23, positionZ)
      stone.scale.set(size * 1.4, size * 0.7, size)
      stone.rotation.set(this.random(), this.random() * Math.PI, 0)
      if (size >= 0.55) this.addObstacle(stone)
      if (index % 3 === 0) {
        for (let blade = 0; blade < 4; blade++) {
          const grass = this.mesh(grassGeometry, grassMaterial, this.root, positionX + 0.6 + blade * 0.09, 0.2, positionZ)
          grass.rotation.z = (blade - 1.5) * 0.3
        }
      }
    }
    for (const [positionX, positionZ] of [[-14, -2], [15, 10], [4, -4]]) {
      const crate = this.box(this.root, this.trim, 0.9, 0.9, 0.9, positionX, 0.4, positionZ)
      this.addObstacle(crate)
      for (const offset of [-0.3, 0.3]) this.box(this.root, this.wood, 0.09, 0.94, 0.94, positionX + offset, 0.4, positionZ)
    }
  }

  update(elapsedTime: number): void {
    this.crystalLights.forEach((light, index) => {
      light.intensity = 18 + Math.sin(elapsedTime * 1.4 + index * 1.7) * 2.5
    })
  }

  dispose(): void {
    this.geometries.forEach((geometry) => geometry.dispose())
    this.materials.forEach((material) => material.dispose())
    this.textures.forEach((texture) => texture.dispose())
  }
}