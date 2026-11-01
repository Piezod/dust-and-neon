import * as THREE from 'three'

export class BossArena {
  readonly root = new THREE.Group()
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly ringMaterial: THREE.MeshBasicMaterial
  private readonly outlineMaterial: THREE.MeshBasicMaterial
  private elapsed = 0

  constructor(scene: THREE.Scene, center: THREE.Vector3, radius: number, color: string) {
    this.root.name = 'BossArena'
    this.root.position.set(center.x, 0.025, center.z)
    this.ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
    this.materials.push(this.ringMaterial)
    this.addRing(radius - 0.22, radius, this.ringMaterial)
    const outlineGeometry = new THREE.TorusGeometry(radius - 0.25, 0.075, 6, 128)
    outlineGeometry.rotateX(Math.PI / 2)
    this.geometries.push(outlineGeometry)
    this.outlineMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })
    this.materials.push(this.outlineMaterial)
    const outline = new THREE.Mesh(outlineGeometry, this.outlineMaterial)
    outline.position.y = 0.12
    outline.renderOrder = 3
    this.root.add(outline)
    const innerMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
    this.materials.push(innerMaterial)
    this.addRing(radius - 0.8, radius - 0.7, innerMaterial)
    const markerGeometry = new THREE.CylinderGeometry(0.16, 0.22, 0.62, 6)
    this.geometries.push(markerGeometry)
    const markerMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.42 })
    this.materials.push(markerMaterial)
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      marker.position.set(Math.cos(angle) * (radius - 0.12), 0.34, Math.sin(angle) * (radius - 0.12))
      marker.castShadow = false
      marker.receiveShadow = false
      this.root.add(marker)
    }
    scene.add(this.root)
  }

  update(deltaTime: number): void {
    this.elapsed += Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    this.ringMaterial.opacity = 0.27 + Math.sin(this.elapsed * 2.4) * 0.07
    this.outlineMaterial.opacity = 0.72 + Math.sin(this.elapsed * 2.4) * 0.18
  }

  dispose(): void {
    this.root.removeFromParent()
    this.geometries.forEach((geometry) => geometry.dispose())
    this.materials.forEach((material) => material.dispose())
    this.geometries.length = 0
    this.materials.length = 0
  }

  private addRing(innerRadius: number, outerRadius: number, material: THREE.Material): void {
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 96)
    geometry.rotateX(-Math.PI / 2)
    this.geometries.push(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.y = 0.012
    mesh.renderOrder = 2
    this.root.add(mesh)
  }
}
