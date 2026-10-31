import * as THREE from 'three'
import type { EnemyVisualDefinition } from './Enemy.types'

export class EnemyVisual {
  readonly root = new THREE.Group()
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly healthFill: THREE.Mesh

  constructor(definition: EnemyVisualDefinition) {
    this.root.name = 'EnemyVisual'
    const body = this.material(definition.bodyColor)
    const accent = this.material(definition.accentColor, 0.1)
    const eyes = this.material(definition.eyeColor, 0.05, definition.eyeColor, 1.8)
    if (definition.bodyHeight < 1.3) this.createCrawler(body, accent, eyes, definition.bodyHeight)
    else this.createOutlaw(body, accent, eyes, definition.bodyHeight)
    this.healthFill = this.box(0x20, 0.045, 0.035, this.material('#f05c52'), 0, definition.bodyHeight + 0.35, 0)
    const healthTrack = this.box(0.24, 0.065, 0.045, this.material('#171c1b'), 0, definition.bodyHeight + 0.35, -0.01)
    healthTrack.renderOrder = 2
    this.healthFill.renderOrder = 3
  }

  updateHealth(ratio: number): void {
    const fraction = THREE.MathUtils.clamp(ratio, 0, 1)
    this.healthFill.scale.x = fraction
    this.healthFill.position.x = -(1 - fraction) * 0.1
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
    this.geometries.clear()
    this.materials.clear()
    this.root.removeFromParent()
  }

  private createCrawler(body: THREE.Material, accent: THREE.Material, eyes: THREE.Material, height: number): void {
    const torso = this.mesh(new THREE.IcosahedronGeometry(0.54, 1), body, 0, height * 0.52, 0)
    torso.scale.set(1.15, 0.72, 0.8)
    const head = this.mesh(new THREE.IcosahedronGeometry(0.28, 0), accent, 0, height * 0.75, 0.38)
    head.scale.set(1.1, 0.9, 1.1)
    for (const side of [-1, 1]) {
      this.mesh(new THREE.SphereGeometry(0.07, 8, 6), eyes, side * 0.16, height * 0.79, 0.61)
      for (const front of [-1, 1]) {
        const leg = this.mesh(new THREE.CylinderGeometry(0.045, 0.07, height * 0.52, 6), accent, side * 0.38, height * 0.28, front * 0.3)
        leg.rotation.z = side * 0.6
        leg.rotation.x = front * -0.28
      }
    }
    this.mesh(new THREE.ConeGeometry(0.11, 0.3, 5), accent, 0, height * 0.48, -0.48).rotation.x = -Math.PI / 2
  }

  private createOutlaw(body: THREE.Material, accent: THREE.Material, eyes: THREE.Material, height: number): void {
    this.box(0.62, height * 0.47, 0.4, body, 0, height * 0.56, 0)
    this.box(0.44, 0.38, 0.38, accent, 0, height * 0.91, 0.04)
    for (const side of [-1, 1]) {
      this.box(0.18, 0.1, 0.045, eyes, side * 0.12, height * 0.94, 0.24)
      const shoulder = this.box(0.22, 0.46, 0.25, accent, side * 0.43, height * 0.55, 0)
      shoulder.rotation.z = side * 0.08
      this.box(0.2, 0.38, 0.22, body, side * 0.2, height * 0.19, 0)
    }
    this.box(0.68, 0.12, 0.46, accent, 0, height * 0.76, 0)
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    this.geometries.add(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.root.add(mesh)
    return mesh
  }

  private box(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    return this.mesh(new THREE.BoxGeometry(width, height, depth), material, x, y, z)
  }

  private material(color: string, metalness = 0, emissive = '#000000', emissiveIntensity = 0): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, metalness, emissive, emissiveIntensity, roughness: 0.7, flatShading: true })
    this.materials.add(material)
    return material
  }
}