import * as THREE from 'three'
import type { BossAttackDefinition, BossAttackRuntimeState, BossDefinition, BossPhaseDefinition } from './Boss.types'

export class BossVisual {
  readonly root = new THREE.Group()
  private readonly model = new THREE.Group()
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly baseMaterials: { readonly material: THREE.MeshStandardMaterial; readonly color: THREE.Color }[] = []
  private readonly telegraph: THREE.Group
  private readonly telegraphRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  private readonly telegraphLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>
  private hitFlash = 0
  private deathProgress = -1
  private deathDuration = 0.55
  private destroyed = false

  constructor(definition: BossDefinition, scene: THREE.Scene) {
    this.root.name = `Boss:${definition.id}`
    this.model.name = `BossModel:${definition.id}`
    this.root.add(this.model)
    for (const part of definition.visualParts) this.addPart(part)

    this.telegraph = new THREE.Group()
    this.telegraph.name = `BossTelegraph:${definition.id}`
    this.telegraph.renderOrder = 16
    this.telegraph.visible = false
    this.telegraphRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }))
    this.telegraphRing.rotation.x = -Math.PI / 2
    this.telegraph.add(this.telegraphRing)
    this.telegraphLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }))
    this.telegraphLines.renderOrder = 17
    this.telegraph.add(this.telegraphLines)
    scene.add(this.telegraph)
  }

  get deathAnimationFinished(): boolean {
    return this.destroyed || this.deathProgress >= 1
  }

  setPhase(phase: BossPhaseDefinition): void {
    const tint = new THREE.Color(phase.visualTint)
    for (const entry of this.baseMaterials) entry.material.color.copy(entry.color).lerp(tint, 0.16)
  }

  showAttack(state: BossAttackRuntimeState | null, attack: BossAttackDefinition | undefined, origin: THREE.Vector3): void {
    if (!state || state.phase !== 'windup' || !attack || attack.telegraph === 'none') {
      this.telegraph.visible = false
      return
    }
    this.telegraph.visible = true
    const color = attack.pattern === 'laser' || attack.pattern === 'zone' || attack.pattern === 'charge' ? '#f05a62' : '#dc4fae'
    this.telegraphRing.material.color.set(color)
    this.telegraphLines.material.color.set(color)
    this.telegraphRing.position.set(origin.x, 0.065, origin.z)
    this.telegraphRing.scale.setScalar(Math.max(0.7, attack.radius ?? 1.6))
    this.telegraphLines.position.set(origin.x, 0.09, origin.z)
    this.telegraphLines.geometry.dispose()
    this.telegraphLines.geometry = new THREE.BufferGeometry()
    const positions: number[] = []
    const target = new THREE.Vector3(...state.targetPosition)
    const direction = target.clone().sub(origin).setY(0)
    if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1)
    direction.normalize()
    const range = attack.maxRange > 0 ? Math.min(attack.maxRange, 15) : 6
    if (attack.telegraph === 'line' || attack.telegraph === 'zone') {
      const end = direction.clone().multiplyScalar(range)
      positions.push(0, 0, 0, end.x, 0, end.z)
      if (attack.telegraph === 'zone') {
        this.telegraphRing.position.set(target.x, 0.065, target.z)
        this.telegraphRing.scale.setScalar(attack.radius ?? 2.2)
      }
    } else if (attack.telegraph === 'fan') {
      const halfAngle = attack.spreadRadians ?? Math.PI / 4
      const left = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), halfAngle).multiplyScalar(range)
      const right = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -halfAngle).multiplyScalar(range)
      positions.push(0, 0, 0, left.x, 0, left.z, 0, 0, 0, right.x, 0, right.z, left.x, 0, left.z, right.x, 0, right.z)
    } else if (attack.telegraph === 'nodes' && attack.pattern === 'arc-nodes') {
      const midpoint = direction.clone().multiplyScalar(Math.min(attack.nodeRange ?? 8, range) * 0.55)
      const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x)
      const halfLength = Math.min((attack.nodeRange ?? 8) * 0.4, range * 0.25)
      const first = midpoint.clone().addScaledVector(perpendicular, -halfLength)
      const second = midpoint.clone().addScaledVector(perpendicular, halfLength)
      positions.push(0, 0, 0, first.x, 0, first.z, 0, 0, 0, second.x, 0, second.z, first.x, 0, first.z, second.x, 0, second.z)
    } else if (attack.telegraph === 'ring') {
      const radius = attack.radius ?? 3
      this.telegraphRing.scale.setScalar(radius)
      this.telegraphRing.position.set(origin.x, 0.065, origin.z)
    }
    this.telegraphLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    this.telegraphLines.computeLineDistances()
    this.telegraphLines.visible = positions.length > 0
  }

  flashOnHit(): void {
    this.hitFlash = 0.16
  }

  startDeath(durationSeconds: number): void {
    this.deathProgress = 0
    this.deathDuration = Math.max(0.05, durationSeconds)
    this.telegraph.visible = false
  }

  update(deltaTime: number): boolean {
    if (this.destroyed) return true
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - elapsed)
      const amount = this.hitFlash / 0.16
      for (const entry of this.baseMaterials) {
        entry.material.emissive.set('#fff3be')
        entry.material.emissiveIntensity = 1.2 * amount
      }
    }
    if (this.deathProgress >= 0) {
      this.deathProgress = Math.min(1, this.deathProgress + elapsed / this.deathDuration)
      const remain = 1 - this.deathProgress
      this.model.scale.setScalar(Math.max(0.02, remain))
      this.model.rotation.z = Math.sin(this.deathProgress * Math.PI) * 0.2
      for (const material of this.materials) {
        if (!('opacity' in material)) continue
        const fadeMaterial = material as THREE.Material & { opacity: number; transparent: boolean }
        fadeMaterial.transparent = true
        fadeMaterial.opacity = remain
      }
      if (this.deathProgress >= 1) this.dispose()
    }
    return this.destroyed
  }

  dispose(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.root.removeFromParent()
    this.telegraph.removeFromParent()
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
    this.telegraphRing.geometry.dispose()
    this.telegraphRing.material.dispose()
    this.telegraphLines.geometry.dispose()
    this.telegraphLines.material.dispose()
    this.geometries.clear()
    this.materials.clear()
  }

  private addPart(part: BossDefinition['visualParts'][number]): void {
    const geometry = this.createGeometry(part.shape, part.size)
    this.geometries.add(geometry)
    const material = new THREE.MeshStandardMaterial({
      color: part.color,
      emissive: part.emissive ?? '#000000',
      emissiveIntensity: part.emissiveIntensity ?? 0,
      roughness: 0.46,
      metalness: part.shape === 'box' || part.shape === 'cylinder' ? 0.35 : 0.12,
      flatShading: true,
    })
    this.materials.add(material)
    this.baseMaterials.push({ material, color: new THREE.Color(part.color) })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...part.position)
    if (part.rotation) mesh.rotation.set(...part.rotation)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.model.add(mesh)
  }

  private createGeometry(shape: BossDefinition['visualParts'][number]['shape'], size: readonly [number, number, number]): THREE.BufferGeometry {
    const [width, height, depth] = size
    if (shape === 'box') return new THREE.BoxGeometry(width, height, depth)
    if (shape === 'sphere') return new THREE.SphereGeometry(width, 12, 8)
    if (shape === 'cone') return new THREE.ConeGeometry(width, height, 10)
    if (shape === 'cylinder') return new THREE.CylinderGeometry(width, depth, height, 10)
    return new THREE.TorusGeometry(width, height, 8, 24)
  }
}
