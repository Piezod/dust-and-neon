import * as THREE from 'three'
import { InputManager } from './InputManager'
import { Player } from '../entities/Player'

export class PlayerController {
  private readonly input: InputManager
  private readonly camera: THREE.Camera
  private readonly player: Player
  private readonly canvas: HTMLCanvasElement
  private readonly obstacles: readonly THREE.Box2[]
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly direction = new THREE.Vector3()
  private readonly cursor = new THREE.Vector2()
  private readonly pointer = new THREE.Vector2()
  private readonly raycaster = new THREE.Raycaster()
  private readonly aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly aimPoint = new THREE.Vector3()
  private pointerActive = false

  constructor(input: InputManager, camera: THREE.Camera, player: Player, canvas: HTMLCanvasElement, obstacles: readonly THREE.Box2[]) {
    this.input = input
    this.camera = camera
    this.player = player
    this.canvas = canvas
    this.obstacles = obstacles
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerleave', this.clearPointer)
    window.addEventListener('blur', this.clearPointer)
  }

  updateMovement(deltaTime: number): void {
    const horizontal = Number(this.input.isPressed('KeyD')) - Number(this.input.isPressed('KeyA'))
    const vertical = Number(this.input.isPressed('KeyW')) - Number(this.input.isPressed('KeyS'))
    this.camera.getWorldDirection(this.forward)
    this.forward.y = 0
    this.forward.normalize()
    this.right.crossVectors(this.forward, this.camera.up).normalize()
    this.direction.copy(this.right).multiplyScalar(horizontal).addScaledVector(this.forward, vertical)
    if (this.direction.lengthSq() > 0) this.direction.normalize()
    this.player.update(this.direction, deltaTime, this.obstacles)
  }

  updateAim(): void {
    if (!this.pointerActive) return
    const bounds = this.canvas.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return
    this.cursor.set((this.pointer.x - bounds.left) / bounds.width * 2 - 1, 1 - (this.pointer.y - bounds.top) / bounds.height * 2)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.cursor, this.camera)
    if (this.raycaster.ray.intersectPlane(this.aimPlane, this.aimPoint)) this.player.facePoint(this.aimPoint)
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pointer.set(event.clientX, event.clientY)
    this.pointerActive = true
  }

  private readonly clearPointer = (): void => {
    this.pointerActive = false
  }

  dispose(): void {
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerleave', this.clearPointer)
    window.removeEventListener('blur', this.clearPointer)
  }
}