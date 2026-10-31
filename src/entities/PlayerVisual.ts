import * as THREE from 'three'

export class PlayerVisual {
  readonly root = new THREE.Group()
  private readonly body = new THREE.Group()
  private readonly leftLeg = new THREE.Group()
  private readonly rightLeg = new THREE.Group()
  private readonly leftArm = new THREE.Group()
  private readonly rightArm = new THREE.Group()
  private readonly muzzle = new THREE.Object3D()
  private readonly coatTails: THREE.Group[] = []
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private walkBlend = 0
  private stride = 0
  private elapsedTime = 0

  constructor() {
    this.root.name = 'GunslingerVisual'
    this.root.add(this.body)
    const coat = this.material('#382b28')
    const leather = this.material('#72503a')
    const trousers = this.material('#344b4d')
    const boots = this.material('#21262a')
    const skin = this.material('#c99168')
    const scarf = this.material('#b92e36')
    const steel = this.material('#85999a', 0.65)
    const gunmetal = this.material('#263f43', 0.65)
    const neon = this.material('#16bda9', 0.2, '#0de0c1', 1.1)

    this.box(this.body, coat, 0.86, 0.75, 0.48, 0, 1.57, 0)
    this.box(this.body, trousers, 0.49, 0.62, 0.06, 0, 1.54, 0.26)
    for (const side of [-1, 1]) {
      const lapel = this.box(this.body, leather, 0.13, 0.55, 0.08, side * 0.23, 1.65, 0.28)
      lapel.rotation.z = side * 0.16
      const tail = new THREE.Group()
      tail.position.set(side * 0.23, 1.18, -0.07)
      this.body.add(tail)
      this.box(tail, coat, 0.42, 0.74, 0.4, 0, -0.35, -0.04)
      this.box(tail, leather, 0.035, 0.66, 0.03, side * 0.17, -0.35, 0.18)
      this.coatTails.push(tail)
    }
    this.box(this.body, boots, 0.91, 0.13, 0.53, 0, 1.19, 0)
    this.box(this.body, steel, 0.2, 0.16, 0.06, 0, 1.19, 0.3)
    this.box(this.body, leather, 0.2, 0.43, 0.25, 0.5, 1.02, -0.03)

    this.box(this.body, skin, 0.19, 0.2, 0.2, 0, 1.99, 0)
    this.box(this.body, skin, 0.42, 0.41, 0.37, 0, 2.18, 0.01)
    this.box(this.body, leather, 0.43, 0.15, 0.12, 0, 2.04, 0.17)
    this.box(this.body, skin, 0.11, 0.12, 0.12, 0, 2.18, 0.23)
    for (const side of [-1, 1]) this.box(this.body, boots, 0.07, 0.035, 0.03, side * 0.11, 2.24, 0.204)
    this.mesh(new THREE.CylinderGeometry(0.27, 0.22, 0.14, 8), scarf, this.body, 0, 1.96, 0.02)
    const bandana = this.mesh(new THREE.ConeGeometry(0.22, 0.38, 3), scarf, this.body, 0, 1.77, 0.32)
    bandana.rotation.z = Math.PI

    const hat = new THREE.Group()
    hat.position.set(0, 2.39, 0)
    hat.rotation.x = -0.07
    this.body.add(hat)
    const brim = this.mesh(new THREE.CylinderGeometry(0.67, 0.67, 0.075, 12), leather, hat, 0, 0, 0)
    brim.scale.z = 0.82
    this.mesh(new THREE.CylinderGeometry(0.29, 0.38, 0.34, 8), coat, hat, 0, 0.19, -0.02)
    this.mesh(new THREE.CylinderGeometry(0.365, 0.38, 0.085, 8), boots, hat, 0, 0.065, -0.02)
    this.box(hat, steel, 0.12, 0.09, 0.04, 0, 0.07, 0.36)

    this.createLeg(this.leftLeg, -0.2, trousers, boots)
    this.createLeg(this.rightLeg, 0.2, trousers, boots)
    this.leftArm.position.set(-0.49, 1.82, 0)
    this.rightArm.position.set(0.49, 1.82, 0)
    this.body.add(this.leftArm, this.rightArm)
    this.box(this.leftArm, coat, 0.24, 0.56, 0.28, 0, -0.26, 0)
    this.box(this.leftArm, leather, 0.25, 0.12, 0.29, 0, -0.54, 0)
    this.box(this.leftArm, skin, 0.18, 0.18, 0.2, 0, -0.66, 0)
    this.box(this.rightArm, coat, 0.25, 0.27, 0.42, 0, -0.14, 0.14)
    this.box(this.rightArm, coat, 0.23, 0.23, 0.35, 0, -0.24, 0.43)
    this.box(this.rightArm, skin, 0.19, 0.19, 0.19, 0, -0.24, 0.64)

    const revolver = new THREE.Group()
    revolver.name = 'Revolver'
    revolver.position.set(0, -0.17, 0.7)
    this.rightArm.add(revolver)
    this.box(revolver, leather, 0.12, 0.27, 0.16, 0, -0.12, 0)
    this.box(revolver, steel, 0.19, 0.18, 0.29, 0, 0.06, 0.09)
    const cylinder = this.mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 8), gunmetal, revolver, 0, 0.07, 0.1)
    cylinder.rotation.x = Math.PI / 2
    this.box(revolver, gunmetal, 0.13, 0.13, 0.47, 0, 0.09, 0.4)
    this.box(revolver, neon, 0.15, 0.035, 0.32, 0, 0.17, 0.4)
    this.box(revolver, neon, 0.145, 0.145, 0.045, 0, 0.09, 0.64)
    this.muzzle.name = 'RevolverMuzzle'
    this.muzzle.position.set(0, 0.09, 0.68)
    revolver.add(this.muzzle)
  }

  private material(color: string, metalness = 0, emissive = '#000000', emissiveIntensity = 0): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.78, emissive, emissiveIntensity, flatShading: true })
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

  private createLeg(pivot: THREE.Group, positionX: number, trousers: THREE.Material, boots: THREE.Material): void {
    pivot.position.set(positionX, 1.02, 0)
    this.body.add(pivot)
    this.box(pivot, trousers, 0.25, 0.65, 0.28, 0, -0.32, 0)
    this.box(pivot, boots, 0.28, 0.32, 0.32, 0, -0.8, 0)
    this.box(pivot, boots, 0.29, 0.16, 0.48, 0, -0.93, 0.09)
  }

  update(deltaTime: number, speedRatio: number): void {
    this.elapsedTime += deltaTime
    const blend = 1 - Math.exp(-12 * deltaTime)
    this.walkBlend = THREE.MathUtils.lerp(this.walkBlend, THREE.MathUtils.clamp(speedRatio, 0, 1), blend)
    this.stride += deltaTime * 10 * this.walkBlend
    const swing = Math.sin(this.stride) * this.walkBlend
    this.leftLeg.rotation.x = swing * 0.5
    this.rightLeg.rotation.x = -swing * 0.5
    this.leftArm.rotation.x = -swing * 0.38
    this.rightArm.rotation.x = swing * 0.045
    this.body.position.y = Math.sin(this.elapsedTime * 2.4) * 0.012 * (1 - this.walkBlend)
      + Math.abs(Math.sin(this.stride)) * 0.035 * this.walkBlend
    this.body.rotation.z = swing * 0.025
    this.coatTails.forEach((tail, index) => {
      tail.rotation.x = Math.sin(this.stride + index * Math.PI) * this.walkBlend * 0.12
    })
  }

  getMuzzleWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    this.root.updateWorldMatrix(true, true)
    return this.muzzle.getWorldPosition(target)
  }

  dispose(): void {
    this.geometries.forEach((geometry) => geometry.dispose())
    this.materials.forEach((material) => material.dispose())
  }
}