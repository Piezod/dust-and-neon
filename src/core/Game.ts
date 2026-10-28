import * as THREE from 'three'
import { InputManager } from './InputManager'
import { World } from '../world/World'
import { setupLighting } from '../world/Lighting'

export class Game {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 180)
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  private readonly input = new InputManager()
  private readonly world = new World()
  private readonly target = new THREE.Vector3(0, 0, 0)
  private readonly cameraOffset = new THREE.Vector3(26, 34, 32)
  private readonly forward = new THREE.Vector3(-26, 0, -32).normalize()
  private readonly right = new THREE.Vector3(32, 0, -26).normalize()
  private readonly movement = new THREE.Vector3()
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
    this.scene.add(this.world.root)
    this.updateCamera()
    this.resize()
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
    this.moveCamera(deltaTime)
    this.world.update(this.elapsedTime)
    this.renderer.render(this.scene, this.camera)
  }

  private moveCamera(deltaTime: number): void {
    const horizontal = Number(this.input.isPressed('KeyD')) - Number(this.input.isPressed('KeyA'))
    const vertical = Number(this.input.isPressed('KeyW')) - Number(this.input.isPressed('KeyS'))
    this.movement.copy(this.right).multiplyScalar(horizontal).addScaledVector(this.forward, vertical)
    if (this.movement.lengthSq() > 0) {
      this.target.addScaledVector(this.movement.normalize(), 12 * deltaTime)
      this.target.x = THREE.MathUtils.clamp(this.target.x, -22, 22)
      this.target.z = THREE.MathUtils.clamp(this.target.z, -22, 22)
      this.updateCamera()
    }
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
    this.input.dispose()
    this.world.dispose()
    this.scene.traverse((object) => {
      if (object instanceof THREE.Light) object.dispose()
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}