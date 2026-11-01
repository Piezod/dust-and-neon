import * as THREE from 'three'
import type { GameEvent, GameEventBus } from '../events/GameEventBus'
import type { GraphicsQuality } from '../core/GameSettings.types'
import { getGraphicsProfile, VISUAL_THEME } from '../config/visualTheme'
import './visual-effects.css'

interface Particle {
  readonly position: THREE.Vector3
  readonly velocity: THREE.Vector3
  readonly color: THREE.Color
  readonly lifetime: number
  readonly size: number
  age: number
}

interface FloatingDamageNumber {
  readonly sprite: THREE.Sprite
  readonly texture: THREE.CanvasTexture
  readonly canvas: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D
  age: number
  lifetime: number
  active: boolean
}

const MAX_PARTICLES = VISUAL_THEME.graphics.high.particleLimit

export class VisualEffectsSystem {
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.ShaderMaterial
  private readonly particles: Particle[] = []
  private readonly damageNumbers: FloatingDamageNumber[] = []
  private readonly flash: THREE.Sprite
  private readonly flashTexture: THREE.CanvasTexture
  private readonly flashDirection = new THREE.Vector3()
  private readonly damageOverlay: HTMLDivElement
  private readonly hitDirection: HTMLDivElement
  private readonly camera: THREE.Camera
  private readonly unsubscribe: () => void
  private flashRemaining = 0
  private flashLifetime = 0.16
  private flashPeakScale = 5.2
  private particleLimit: number = MAX_PARTICLES
  private currentQuality: GraphicsQuality = 'high'
  private flashAnimation: Animation | null = null
  private hitDirectionAnimation: Animation | null = null

  constructor(scene: THREE.Scene, camera: THREE.Camera, container: HTMLElement, events: GameEventBus, quality: GraphicsQuality) {
    this.camera = camera
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', this.dynamicAttribute(new Float32Array(MAX_PARTICLES * 3), 3))
      this.geometry.setAttribute('aColor', this.dynamicAttribute(new Float32Array(MAX_PARTICLES * 3), 3))
    this.geometry.setAttribute('aAlpha', this.dynamicAttribute(new Float32Array(MAX_PARTICLES), 1))
    this.geometry.setAttribute('aSize', this.dynamicAttribute(new Float32Array(MAX_PARTICLES), 1))
    this.geometry.setDrawRange(0, 0)
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uOpacity: { value: 1 },
        uPixelsPerWorld: { value: 12 },
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aAlpha;
        attribute float aSize;
        uniform float uPixelsPerWorld;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          gl_PointSize = max(3.0, aSize * uPixelsPerWorld);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float edge = 1.0 - smoothstep(0.28, 0.5, length(gl_PointCoord - vec2(0.5)));
          float alpha = vAlpha * uOpacity * edge;
          if (alpha < 0.015) discard;
          gl_FragColor = vec4(vColor, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    })
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.name = 'CombatVisualEffects'
    this.points.frustumCulled = false
    this.points.renderOrder = 8
    scene.add(this.points)
    for (let index = 0; index < VISUAL_THEME.graphics.high.damageNumberLimit; index++) {
      this.damageNumbers.push(this.createDamageNumber(scene))
    }

    this.flashTexture = this.createFlashTexture()
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.flashTexture,
      color: '#fff2ce',
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }))
    this.flash.name = 'MuzzleFlash'
    this.flash.visible = false
    this.flash.renderOrder = 7
    scene.add(this.flash)

    this.damageOverlay = document.createElement('div')
    this.damageOverlay.className = 'vfx-damage-flash'
    this.damageOverlay.setAttribute('aria-hidden', 'true')
    this.hitDirection = document.createElement('div')
    this.hitDirection.className = 'vfx-hit-direction'
    this.hitDirection.setAttribute('aria-hidden', 'true')
    container.append(this.damageOverlay, this.hitDirection)
    this.setGraphicsQuality(quality)
    this.unsubscribe = events.subscribe((event) => this.onEvent(event))
  }

  get activeParticleCount(): number {
    return this.particles.length
  }

  get activeDamageNumberCount(): number {
    return this.damageNumbers.reduce((count, entry) => count + Number(entry.active), 0)
  }

  setGraphicsQuality(quality: GraphicsQuality): void {
    const profile = getGraphicsProfile(quality)
    this.currentQuality = quality
    this.particleLimit = profile.particleLimit
    this.damageNumbers.forEach((entry, index) => {
      if (index >= profile.damageNumberLimit) {
        entry.active = false
        entry.sprite.visible = false
      }
    })
    this.material.uniforms.uOpacity.value = profile.effects
    this.compactParticles()
  }

  setWorldToPixelScale(pixelsPerWorldUnit: number): void {
    this.material.uniforms.uPixelsPerWorld.value = Number.isFinite(pixelsPerWorldUnit)
      ? THREE.MathUtils.clamp(pixelsPerWorldUnit, 1, 48)
      : 12
  }

  update(deltaTime: number): void {
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    if (this.flashRemaining > 0) {
      this.flashRemaining = Math.max(0, this.flashRemaining - elapsed)
      const progress = this.flashRemaining / this.flashLifetime
      this.flash.material.opacity = Math.min(1, progress * 1.2)
      this.flash.scale.setScalar(this.flashPeakScale * (0.2 + progress * 0.8))
      if (this.flashRemaining === 0) this.flash.visible = false
    }

    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index]
      particle.age += elapsed
      if (particle.age >= particle.lifetime) {
        this.particles.splice(index, 1)
        continue
      }
      particle.position.addScaledVector(particle.velocity, elapsed)
      particle.velocity.y -= 0.65 * elapsed
    }
    this.updateDamageNumbers(elapsed)
    this.writeParticles()
  }

  dispose(): void {
    this.unsubscribe()
    this.flashAnimation?.cancel()
    this.flashAnimation = null
    this.hitDirectionAnimation?.cancel()
    this.hitDirectionAnimation = null
    this.points.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
    this.flash.removeFromParent()
    this.flash.material.dispose()
    this.flashTexture.dispose()
    for (const entry of this.damageNumbers) {
      entry.sprite.removeFromParent()
      entry.sprite.material.dispose()
      entry.texture.dispose()
    }
    this.damageOverlay.remove()
    this.hitDirection.remove()
    this.particles.length = 0
  }

  private onEvent(event: GameEvent): void {
    switch (event.type) {
      case 'player-shot':
        this.flashDirection.set(...event.direction).normalize()
        this.flash.position.set(...event.position).addScaledVector(this.flashDirection, 0.62)
        this.flash.rotation.y = Math.atan2(event.direction[0], event.direction[2])
        this.flash.visible = true
        this.flash.scale.setScalar(2.4)
        this.flashPeakScale = 2.4
          this.flashRemaining = 0.36
          this.flashLifetime = 0.36
        this.flash.material.color.set(VISUAL_THEME.colors.parchment)
        this.burst(event.position, VISUAL_THEME.colors.cyan, 5, 1.4, 0.24)
        break
      case 'projectile-spawned':
        if (event.sourceFaction === 'enemies') {
          const plasma = event.projectileId.includes('plasma')
          this.flashDirection.set(...event.direction).normalize()
          this.flash.position.set(...event.position).addScaledVector(this.flashDirection, 0.26)
          this.flash.rotation.y = Math.atan2(event.direction[0], event.direction[2])
          this.flash.material.color.set(plasma ? VISUAL_THEME.colors.alienViolet : VISUAL_THEME.colors.danger)
          this.flash.visible = true
          this.flash.scale.setScalar(plasma ? 2.5 : 2.2)
          this.flashPeakScale = plasma ? 2.5 : 2.2
          this.flashRemaining = 0.18
          this.flashLifetime = 0.18
          this.burst(event.position, plasma ? VISUAL_THEME.colors.alienViolet : VISUAL_THEME.colors.danger, 5, 1.8, 0.24)
        }
        break
      case 'projectile-impact':
        if (event.targetFaction === 'environment' || event.targetFaction === 'player') {
          const plasma = event.projectileId.includes('plasma')
          this.burst(event.position, plasma ? VISUAL_THEME.colors.alienViolet : VISUAL_THEME.colors.electricBlue, plasma ? 12 : 8, plasma ? 4.2 : 2.8, plasma ? 0.34 : 0.28)
        }
        break
      case 'enemy-damaged':
        this.burst(event.position, VISUAL_THEME.colors.parchment, 6, 2.4, 0.22)
        this.spawnDamageNumber(event.position, event.amount, VISUAL_THEME.colors.parchment)
        break
      case 'enemy-killed':
        this.burst([event.death.position[0], 0.55, event.death.position[2]], VISUAL_THEME.colors.danger, 16, 3.5, 0.38)
        this.burst([event.death.position[0], 0.55, event.death.position[2]], VISUAL_THEME.colors.magenta, 9, 2.2, 0.3)
        break
      case 'player-damaged':
        this.burst(event.position, VISUAL_THEME.colors.danger, event.lethal ? 18 : 10, event.lethal ? 3.5 : 2, 0.34)
        this.spawnDamageNumber(event.position, -event.amount, VISUAL_THEME.colors.danger)
        this.showDamageFlash(event.lethal, event.position, event.sourcePosition)
        break
      case 'loot-collected': {
        const color = event.reward.type === 'gold'
          ? VISUAL_THEME.colors.parchment
          : event.reward.type === 'health' ? VISUAL_THEME.colors.danger : VISUAL_THEME.colors.cyan
        this.burst([event.position[0], event.position[1] + 0.42, event.position[2]], color, 10, 2.6, 0.28)
        break
      }
      case 'dash-activated':
        this.burst([event.position[0], 0.14, event.position[2]], VISUAL_THEME.colors.sandLight, 14, 1.15, 0.32)
        this.burst([event.position[0], 0.45, event.position[2]], VISUAL_THEME.colors.cyan, 16, 3.2, 0.38)
        break
      case 'player-ability-used': {
        const color = event.abilityId === 'arc-voltaic' ? VISUAL_THEME.colors.electricBlue : '#8de8ff'
        this.burst(event.position, color, event.abilityId === 'arc-voltaic' ? 12 : 22, 2.4, 0.3)
        for (const target of event.targets) this.burst(target, color, 8, 1.8, 0.26)
        break
      }
      case 'player-moved':
        this.burst([event.position[0], 0.12, event.position[2]], VISUAL_THEME.colors.sandLight, 4, 0.65, 0.2)
        break
      case 'debug-effect-requested':
        this.flash.position.set(...event.position)
        this.flash.visible = true
        this.flashRemaining = 2
        this.flashLifetime = 2
        this.flash.scale.setScalar(3.2)
        this.flashPeakScale = 3.2
        this.flash.material.color.set(VISUAL_THEME.colors.parchment)
        this.burst([event.position[0], 0.12, event.position[2]], VISUAL_THEME.colors.sandLight, 14, 1.15, 0.32)
        this.burst(event.position, VISUAL_THEME.colors.cyan, 12, 2.8, 0.38)
        break
      default:
        break
    }
  }

  private burst(position: readonly [number, number, number], colorHex: string, count: number, speed: number, size: number): void {
    const color = new THREE.Color(colorHex)
    for (let index = 0; index < count && this.particles.length < this.particleLimit; index++) {
      const angle = Math.random() * Math.PI * 2
      const upward = Math.random() * 0.9 + 0.18
      const velocity = new THREE.Vector3(Math.cos(angle), upward, Math.sin(angle))
        .normalize()
        .multiplyScalar(speed * (0.45 + Math.random() * 0.75))
      this.particles.push({
        position: new THREE.Vector3(position[0], position[1], position[2]),
        velocity,
        color,
        lifetime: 0.22 + Math.random() * 0.34,
        size: size * (0.65 + Math.random() * 0.7),
        age: 0,
      })
    }
  }

  private writeParticles(): void {
    const positions = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const colors = this.geometry.getAttribute('aColor') as THREE.BufferAttribute
    const alphas = this.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    const sizes = this.geometry.getAttribute('aSize') as THREE.BufferAttribute
    this.particles.forEach((particle, index) => {
      const progress = particle.age / particle.lifetime
      positions.setXYZ(index, particle.position.x, particle.position.y, particle.position.z)
      colors.setXYZ(index, particle.color.r, particle.color.g, particle.color.b)
      alphas.setX(index, Math.min(1, (1 - progress) * 1.4))
      sizes.setX(index, particle.size)
    })
    positions.needsUpdate = true
    colors.needsUpdate = true
    alphas.needsUpdate = true
    sizes.needsUpdate = true
    this.geometry.setDrawRange(0, this.particles.length)
  }

  private compactParticles(): void {
    if (this.particles.length > this.particleLimit) this.particles.length = this.particleLimit
    this.writeParticles()
  }

  private dynamicAttribute(array: Float32Array, itemSize: number): THREE.BufferAttribute {
    return new THREE.BufferAttribute(array, itemSize).setUsage(THREE.DynamicDrawUsage)
  }

  private createFlashTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(0.12, '#fff3be')
    gradient.addColorStop(0.38, '#ffc45c')
    gradient.addColorStop(0.72, '#ff7138aa')
    gradient.addColorStop(1, '#ff402000')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  private createDamageNumber(scene: THREE.Scene): FloatingDamageNumber {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 96
    const context = canvas.getContext('2d')!
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.name = 'FloatingDamageNumber'
    sprite.scale.set(1.7, 0.64, 1)
    sprite.renderOrder = 10
    sprite.frustumCulled = false
    sprite.visible = false
    scene.add(sprite)
    return { sprite, texture, canvas, context, age: 0, lifetime: 0.82, active: false }
  }

  private spawnDamageNumber(position: readonly [number, number, number], amount: number, color: string): void {
    const available = this.damageNumbers.slice(0, getGraphicsProfile(this.currentQuality).damageNumberLimit)
    const slot = available.find((entry) => !entry.active)
      ?? available.reduce<FloatingDamageNumber | null>((oldest, entry) => !oldest || entry.age > oldest.age ? entry : oldest, null)
    if (!slot) return
    const label = `${amount < 0 ? '-' : ''}${Math.max(1, Math.round(Math.abs(amount)))}`
    slot.context.clearRect(0, 0, slot.canvas.width, slot.canvas.height)
    slot.context.textAlign = 'center'
    slot.context.textBaseline = 'middle'
    slot.context.font = 'bold 70px Bahnschrift, sans-serif'
    slot.context.lineJoin = 'round'
    slot.context.lineWidth = 12
    slot.context.strokeStyle = '#171a20ee'
    slot.context.strokeText(label, 128, 48)
    slot.context.fillStyle = color
    slot.context.fillText(label, 128, 48)
    slot.texture.needsUpdate = true
    slot.sprite.position.set(position[0], position[1] + 0.35, position[2])
    slot.sprite.material.opacity = 1
    slot.sprite.visible = true
    slot.age = 0
    slot.lifetime = 0.82
    slot.active = true
  }

  private updateDamageNumbers(deltaTime: number): void {
    for (const entry of this.damageNumbers) {
      if (!entry.active) continue
      entry.age += deltaTime
      if (entry.age >= entry.lifetime) {
        entry.active = false
        entry.sprite.visible = false
        continue
      }
      const progress = entry.age / entry.lifetime
      entry.sprite.position.y += deltaTime * 0.72
      entry.sprite.material.opacity = progress < 0.6 ? 1 : (1 - progress) / 0.4
      entry.sprite.scale.set(1.7 + progress * 0.12, 0.64 + progress * 0.08, 1)
    }
  }

  private showDamageFlash(lethal: boolean, hitPosition: readonly [number, number, number], sourcePosition?: readonly [number, number, number]): void {
    this.flashAnimation?.cancel()
    this.flashAnimation = this.damageOverlay.animate([
      { opacity: 0 },
      { opacity: lethal ? 0.54 : 0.27, offset: 0.12 },
      { opacity: 0 },
    ], { duration: lethal ? 420 : 260, easing: 'ease-out' })
    if (!sourcePosition) return
    const hit = new THREE.Vector3(...hitPosition).project(this.camera)
    const source = new THREE.Vector3(...sourcePosition).project(this.camera)
    const screenX = source.x - hit.x
    const screenY = hit.y - source.y
    if (screenX * screenX + screenY * screenY < 1e-5) return
    const angle = Math.atan2(screenY, screenX)
    this.hitDirection.style.setProperty('--hit-angle', `${angle}rad`)
    this.hitDirectionAnimation?.cancel()
    this.hitDirectionAnimation = this.hitDirection.animate([
      { opacity: 0, transform: `translate(-50%, -50%) rotate(${angle}rad) translateX(25vmin)` },
      { opacity: 1, transform: `translate(-50%, -50%) rotate(${angle}rad) translateX(30vmin)`, offset: 0.14 },
      { opacity: 0, transform: `translate(-50%, -50%) rotate(${angle}rad) translateX(30vmin)` },
    ], { duration: lethal ? 650 : 420, easing: 'ease-out' })
  }
}
