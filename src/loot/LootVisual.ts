import * as THREE from 'three'
import type { LootRewardType } from './Loot.types'

export class LootVisual {
  readonly root = new THREE.Group()
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly baseY: number
  private elapsed = 0

  constructor(type: LootRewardType, position: THREE.Vector3, phase = 0) {
    this.root.name = `Loot:${type}`
    this.root.position.copy(position)
    this.baseY = position.y
    this.elapsed = phase
    if (type === 'health') this.createHealthVisual()
    else if (type === 'energy') this.createEnergyVisual()
    else if (type === 'gold') this.createGoldVisual()
    else throw new Error(`No loot visual registered for ${type}`)
  }

  update(deltaTime: number): void {
    this.elapsed += Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    this.root.rotation.y = this.elapsed * 1.35
    this.root.position.y = this.baseY + Math.sin(this.elapsed * 3.2) * 0.1
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
    this.geometries.clear()
    this.materials.clear()
    this.root.removeFromParent()
  }

  private createHealthVisual(): void {
    const red = this.material('#ed514c', '#9d1c2b', 0.65)
    const mark = this.material('#fff0d3', '#d2ab78', 0.25)
    this.mesh(new THREE.DodecahedronGeometry(0.35, 0), red, 0, 0.38, 0)
    this.box(0.1, 0.34, 0.06, mark, 0, 0.39, 0.3)
    this.box(0.28, 0.1, 0.06, mark, 0, 0.39, 0.3)
    this.mesh(new THREE.TorusGeometry(0.36, 0.025, 5, 16), mark, 0, 0.38, 0).rotation.x = Math.PI / 2
  }

  private createEnergyVisual(): void {
    const cyan = this.material('#54e8dc', '#0fb8ae', 1.4)
    const highlight = this.material('#d5fff3', '#56dfd1', 0.8)
    const crystal = this.mesh(new THREE.OctahedronGeometry(0.4, 0), cyan, 0, 0.48, 0)
    crystal.scale.set(0.76, 1.25, 0.76)
    this.mesh(new THREE.OctahedronGeometry(0.16, 0), highlight, 0, 0.49, 0.08)
    this.mesh(new THREE.TorusGeometry(0.44, 0.025, 5, 18), highlight, 0, 0.2, 0).rotation.x = Math.PI / 2
  }

  private createGoldVisual(): void {
    const gold = this.material('#f6cb68', '#bd7821', 0.35, 0.72)
    const edge = this.material('#fff0a8', '#dca23b', 0.4, 0.8)
    for (const offset of [-0.07, 0, 0.07]) {
      const coin = this.mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12), gold, offset, 0.31 + Math.abs(offset) * 0.5, 0)
      coin.rotation.z = offset * 2
      this.mesh(new THREE.TorusGeometry(0.2, 0.018, 4, 12), edge, offset, 0.36 + Math.abs(offset) * 0.5, 0.045)
    }
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

  private material(color: string, emissive: string, emissiveIntensity: number, metalness = 0): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, metalness, roughness: 0.42, flatShading: true })
    this.materials.add(material)
    return material
  }
}