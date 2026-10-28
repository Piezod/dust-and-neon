import * as THREE from 'three'
import { InputManager } from './InputManager'
import { PlayerController } from './PlayerController'
import { Player } from '../entities/Player'
import { World } from '../world/World'
import { setupLighting } from '../world/Lighting'

export class Game {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 180)
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  private readonly input = new InputManager()
  private readonly world = new World()
  private readonly player = new Player()
  private readonly controller: PlayerController
  private readonly target = new THREE.Vector3(0, 0, 0)
  private readonly cameraOffset = new THREE.Vector3(26, 34, 32)
  private previousTime = 0
  private elapsedTime = 0
  private running = false

  constructor(container: HTMLElement) {
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2
    this.renderer.domElement.setAttribute('aria-label', 'DUST & NEON: escenario western alienigena en 3D')
    container.append(this.renderer.domElement)
    setupLighting(this.scene)
    this.scene.add(this.world.root, this.player.root)
    this.target.copy(this.player.position)
    this.updateCamera()
    this.resize()
    this.controller = new PlayerController(this.input, this.camera, this.player, this.renderer.domElement, this.world.obstacles)
    window.addEventListener('resize', this.resize)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.previousTime = performance.now()
    this.renderer.setAnimationLoop(this.tick)
  }

  private readonly tick = (time: number): void => {
    const deltaTime = Math.min(Math.max((time - this.previousTime) / 1000, 0), 0.05)
    this.previousTime = time
    this.elapsedTime += deltaTime
    this.controller.updateMovement(deltaTime)
    this.target.lerp(this.player.position, 1 - Math.exp(-6 * deltaTime))
    this.updateCamera()
    this.controller.updateAim()
    this.world.update(this.elapsedTime)
    this.renderer.render(this.scene, this.camera)
  }

  private updateCamera(): void {
    this.camera.position.copy(this.target).add(this.cameraOffset)
    this.camera.lookAt(this.target)
  }

  private readonly resize = (): void => {
    const width = Math.max(window.innerWidth, 1)
    const height = Math.max(window.innerHeight, 1)
    const aspect = width / height
    const viewHeight = Math.max(34, 45 / aspect)
    this.camera.left = -viewHeight * aspect / 2
    this.camera.right = viewHeight * aspect / 2
    this.camera.top = viewHeight / 2
    this.camera.bottom = -viewHeight / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.setSize(width, height)
  }

  dispose(): void {
    this.running = false
    this.renderer.setAnimationLoop(null)
    window.removeEventListener('resize', this.resize)
    this.controller.dispose()
    this.input.dispose()
    this.player.dispose()
    this.world.dispose()
    this.scene.traverse((object) => {
      if (object instanceof THREE.Light) object.dispose()
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}