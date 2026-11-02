import * as THREE from 'three'
import type { EnemyAttackDefinition, EnemyAttackPhase, EnemyAttackPhaseState, EnemyAttackType, EnemyVisualDefinition, EnemyVisualPartDefinition } from './Enemy.types'
import { VISUAL_THEME } from '../config/visualTheme'

export class EnemyVisual {
  readonly root = new THREE.Group()
  private readonly model = new THREE.Group()
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly bodyMaterial: THREE.MeshStandardMaterial
  private readonly accentMaterial: THREE.MeshStandardMaterial
  private readonly attackTelegraph: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>
  private readonly patternTelegraph: THREE.Group | null
  private readonly patternLine: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | null
  private readonly patternRingGeometry: THREE.RingGeometry | null
  private readonly patternRingMaterial: THREE.MeshBasicMaterial | null
  private readonly patternMarkers: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = []
  private attackPhase: EnemyAttackPhaseState | null = null
  private attackType: EnemyAttackType = 'melee'
  private hitFlashRemaining = 0
  private hitFlashStrength = 0
  private deathProgress = -1
  private deathDuration = 0.38
  private elapsedTime = 0

  constructor(definition: EnemyVisualDefinition) {
    this.root.name = 'EnemyVisual'
    this.root.add(this.model)
    this.model.name = 'EnemyModelVisual'
    this.bodyMaterial = this.material(definition.bodyColor)
    this.accentMaterial = this.material(definition.accentColor, 0.1)
    const eyes = this.material(definition.eyeColor, 0.05, definition.eyeColor, 1.8)
    if (definition.parts?.length) {
      for (const part of definition.parts) this.createPart(part, this.bodyMaterial, this.accentMaterial, eyes)
    } else if (definition.bodyHeight < 1.3) this.createCrawler(this.bodyMaterial, this.accentMaterial, eyes, definition.bodyHeight)
    else this.createOutlaw(this.bodyMaterial, this.accentMaterial, eyes, definition.bodyHeight)
    this.attackTelegraph = this.mesh(new THREE.TorusGeometry(0.72, 0.055, 5, 28), new THREE.MeshBasicMaterial({
      color: VISUAL_THEME.colors.danger,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }), 0, 0.045, 0) as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>
    this.attackTelegraph.rotation.x = Math.PI / 2
    this.attackTelegraph.name = 'EnemyAttackTelegraph'
    this.attackTelegraph.visible = false
    this.attackTelegraph.renderOrder = 5
    if (definition.parts?.length) {
      this.patternTelegraph = new THREE.Group()
      this.patternTelegraph.name = 'ExperimentalEnemyTelegraph'
      this.patternTelegraph.visible = false
      this.patternRingGeometry = new THREE.RingGeometry(0.82, 1, 32)
      this.patternRingMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false })
      const lineGeometry = new THREE.BufferGeometry()
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(120), 3))
      this.patternLine = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, toneMapped: false }))
      this.patternLine.renderOrder = 7
      this.patternTelegraph.add(this.patternLine)
      for (let index = 0; index < 5; index++) {
        const marker = new THREE.Mesh(this.patternRingGeometry, this.patternRingMaterial)
        marker.rotation.x = -Math.PI / 2
        marker.renderOrder = 6
        marker.visible = false
        this.patternMarkers.push(marker)
        this.patternTelegraph.add(marker)
      }
      this.root.add(this.patternTelegraph)
    } else {
      this.patternTelegraph = null
      this.patternLine = null
      this.patternRingGeometry = null
      this.patternRingMaterial = null
    }
  }

  flashOnHit(amount: number): void {
    this.hitFlashRemaining = 0.16
    this.hitFlashStrength = THREE.MathUtils.clamp(0.55 + amount / 80, 0.55, 1.2)
  }

  setAttackPhase(state: EnemyAttackPhaseState | null, type: EnemyAttackType = 'melee'): void {
    this.attackPhase = state
    this.attackType = type
    this.attackTelegraph.visible = state?.phase === 'windup'
    this.refreshCombatGlow()
  }

  setPatternAttack(attack: EnemyAttackDefinition | null, phase: EnemyAttackPhase | null, progress: number, target: THREE.Vector3): void {
    if (!this.patternTelegraph || !this.patternLine || !this.patternRingMaterial) return
    const visibleFuse = attack?.pattern?.kind === 'suicide' && phase === 'active'
    const visibleBurrow = attack?.pattern?.kind === 'burrow' && phase === 'active'
    if (!attack || (phase !== 'windup' && !visibleFuse && !visibleBurrow) || !attack.telegraph) {
      this.patternTelegraph.visible = false
      return
    }
    const telegraph = attack.telegraph
    this.patternTelegraph.visible = true
    this.patternRingMaterial.color.set(telegraph.color)
    this.patternLine.material.color.set(telegraph.color)
    this.patternRingMaterial.opacity = 0.25 + THREE.MathUtils.clamp(progress, 0, 1) * 0.45
    this.patternLine.material.opacity = 0.55 + THREE.MathUtils.clamp(progress, 0, 1) * 0.4
    this.root.updateWorldMatrix(true, false)
    const localTarget = this.root.worldToLocal(target.clone())
    const direction = localTarget.clone().setY(0)
    if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1)
    direction.normalize()
    const pattern = attack.pattern
    const range = pattern?.kind === 'cone' || pattern?.kind === 'line' ? pattern.range
      : pattern?.kind === 'charge' ? pattern.maxDistance
        : pattern?.kind === 'burrow' ? pattern.travelDistance
          : pattern?.kind === 'leap' ? pattern.maxDistance : attack.maxRange
    const positions: number[] = []
    let markerIndex = 0
    const addMarker = (x: number, z: number, radius: number): void => {
      const marker = this.patternMarkers[markerIndex++]
      if (!marker) return
      marker.visible = true
      marker.position.set(x, 0.07, z)
      marker.scale.setScalar(Math.max(0.45, radius))
    }
    for (const marker of this.patternMarkers) marker.visible = false
    if (telegraph.shape === 'line') {
      positions.push(0, 0.1, 0, direction.x * range, 0.1, direction.z * range)
    } else if (telegraph.shape === 'fan') {
      const spread = pattern?.kind === 'fan' ? pattern.spreadRadians
        : pattern?.kind === 'cone' ? pattern.angleRadians : Math.PI / 3
      for (const angle of [-spread / 2, spread / 2]) {
        const edge = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).multiplyScalar(range)
        positions.push(0, 0.1, 0, edge.x, 0.1, edge.z)
      }
    } else if (telegraph.shape === 'radial' && pattern?.kind === 'radial') {
      const rayCount = pattern.projectileCount
      const rayLength = Math.min(attack.projectile?.maxRange ?? attack.maxRange, attack.maxRange)
      for (let index = 0; index < rayCount; index++) {
        const angle = index * Math.PI * 2 / rayCount
        positions.push(0, 0.1, 0, Math.cos(angle) * rayLength, 0.1, Math.sin(angle) * rayLength)
      }
    } else if (telegraph.shape === 'markers' && attack.pattern?.kind === 'multi-zone') {
      const count = Math.min(5, attack.pattern.zoneCount)
      for (let index = 0; index < count; index++) {
        const angle = index * Math.PI * 2 / count
        addMarker(localTarget.x + Math.cos(angle) * attack.pattern.spreadDistance, localTarget.z + Math.sin(angle) * attack.pattern.spreadDistance, attack.pattern.radius)
      }
    } else if (telegraph.shape === 'markers' && pattern?.kind === 'arc-nodes') {
      const midpoint = localTarget.clone().multiplyScalar(0.55)
      const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x)
      const halfLength = Math.min(pattern.nodeRange * 0.45, localTarget.length() * 0.3)
      const first = midpoint.clone().addScaledVector(perpendicular, -halfLength)
      const second = midpoint.clone().addScaledVector(perpendicular, halfLength)
      addMarker(first.x, first.z, 0.34)
      addMarker(second.x, second.z, 0.34)
      positions.push(first.x, 0.1, first.z, second.x, 0.1, second.z)
    } else if (telegraph.shape === 'burrow') {
      addMarker(0, 0, telegraph.radius ?? 1.2)
      addMarker(direction.x * Math.min(range, 5), direction.z * Math.min(range, 5), telegraph.radius ?? 1.2)
    } else {
      const targetRadius = telegraph.radius ?? (attack.pattern?.kind === 'cone' ? attack.pattern.range * Math.tan(attack.pattern.angleRadians / 2) : 2)
      if (attack.pattern?.kind === 'suicide') addMarker(0, 0, targetRadius)
      else if (telegraph.shape === 'ring') addMarker(localTarget.x, localTarget.z, targetRadius)
      else addMarker(0, 0, targetRadius)
    }
    const linePositions = this.patternLine.geometry.getAttribute('position')
    for (let index = 0; index < 40; index++) {
      const offset = index * 3
      linePositions.setXYZ(index, positions[offset] ?? 0, positions[offset + 1] ?? 0, positions[offset + 2] ?? 0)
    }
    linePositions.needsUpdate = true
    this.patternLine.geometry.setDrawRange(0, positions.length / 3)
    this.patternLine.visible = positions.length > 0
    this.patternTelegraph.position.set(0, 0, 0)
  }

  setBurrowed(burrowed: boolean): void {
    this.model.visible = !burrowed
    if (this.patternTelegraph && burrowed) this.patternTelegraph.visible = true
    this.attackTelegraph.visible = burrowed || this.attackPhase?.phase === 'windup'
    if (burrowed) {
      this.attackTelegraph.material.color.set(VISUAL_THEME.colors.cyan)
      this.attackTelegraph.material.opacity = 0.86
      this.attackTelegraph.scale.setScalar(1.35)
    }
  }

  update(deltaTime: number): void {
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    this.elapsedTime += elapsed
    this.hitFlashRemaining = Math.max(0, this.hitFlashRemaining - elapsed)
    const hitProgress = this.hitFlashRemaining / 0.16
    const hitStrength = hitProgress * this.hitFlashStrength
    this.model.rotation.z = Math.sin((1 - hitProgress) * Math.PI) * hitStrength * 0.24
    this.model.position.y = hitProgress * hitStrength * 0.09
    if (this.deathProgress >= 0) {
      this.deathProgress = Math.min(1, this.deathProgress + elapsed / this.deathDuration)
      const remain = 1 - this.deathProgress
      this.model.scale.setScalar(Math.max(0.04, remain))
      this.model.rotation.z = Math.sin(this.deathProgress * Math.PI) * 0.28
      this.model.position.y = this.deathProgress * 0.24
      for (const material of this.materials) {
        if (!('opacity' in material)) continue
        const fadeMaterial = material as THREE.Material & { opacity: number; transparent: boolean }
        fadeMaterial.transparent = true
        fadeMaterial.opacity = remain
      }
    }
    this.refreshCombatGlow()
    if (this.patternTelegraph?.visible && this.patternRingMaterial) this.patternRingMaterial.opacity = 0.32 + Math.sin(this.elapsedTime * 12) * 0.14
  }

  startDeathAnimation(durationSeconds = 0.38): void {
    this.deathProgress = 0
    this.deathDuration = Math.max(0.01, durationSeconds)
    this.attackTelegraph.visible = false
    if (this.patternTelegraph) this.patternTelegraph.visible = false
  }

  get deathAnimationFinished(): boolean {
    return this.deathProgress >= 1
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
    this.geometries.clear()
    this.materials.clear()
    this.patternLine?.geometry.dispose()
    this.patternLine?.material.dispose()
    this.patternRingGeometry?.dispose()
    this.patternRingMaterial?.dispose()
    this.patternTelegraph?.removeFromParent()
    this.root.removeFromParent()
  }

  private refreshCombatGlow(): void {
    if (this.deathProgress >= 0) {
      this.attackTelegraph.visible = false
      this.bodyMaterial.emissive.set(VISUAL_THEME.colors.danger)
      this.bodyMaterial.emissiveIntensity = 0.7 * (1 - this.deathProgress)
      return
    }
    const hitProgress = this.hitFlashRemaining / 0.16
    if (hitProgress > 0) {
      this.bodyMaterial.emissive.set(VISUAL_THEME.colors.parchment)
      this.bodyMaterial.emissiveIntensity = 1.35 * hitProgress * this.hitFlashStrength
      this.accentMaterial.emissive.set(VISUAL_THEME.colors.parchment)
      this.accentMaterial.emissiveIntensity = 0.8 * hitProgress * this.hitFlashStrength
      return
    }
    const state = this.attackPhase
    if (state?.phase === 'windup') {
      const color = this.attackType === 'projectile' ? VISUAL_THEME.colors.alienViolet : VISUAL_THEME.colors.danger
      this.attackTelegraph.material.color.set(color)
      this.attackTelegraph.material.opacity = 0.35 + state.progress * 0.55
      this.attackTelegraph.scale.setScalar(0.75 + state.progress * 0.45)
      this.bodyMaterial.emissive.set(color)
      this.bodyMaterial.emissiveIntensity = 0.45 + state.progress * 0.85
      this.accentMaterial.emissive.set(color)
      this.accentMaterial.emissiveIntensity = 0.25 + state.progress * 0.7
      return
    }
    this.bodyMaterial.emissive.set('#000000')
    this.bodyMaterial.emissiveIntensity = 0
    this.accentMaterial.emissive.set('#000000')
    this.accentMaterial.emissiveIntensity = 0
    this.attackTelegraph.visible = false
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

  private createPart(part: EnemyVisualPartDefinition, body: THREE.Material, accent: THREE.Material, eyes: THREE.Material): void {
    const [width, height, depth] = part.size
    const geometry = part.shape === 'box' ? new THREE.BoxGeometry(width, height, depth)
      : part.shape === 'sphere' ? new THREE.SphereGeometry(width, 10, 7)
        : part.shape === 'cone' ? new THREE.ConeGeometry(width, height, 7)
          : part.shape === 'cylinder' ? new THREE.CylinderGeometry(width, depth, height, 8)
            : new THREE.TorusGeometry(width, height, 6, 16)
    const material = part.material === 'body' ? body : part.material === 'accent' ? accent : eyes
    const mesh = this.mesh(geometry, material, ...part.position)
    if (part.rotation) mesh.rotation.set(...part.rotation)
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
    this.materials.add(material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.model.add(mesh)
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