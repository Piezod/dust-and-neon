import * as THREE from 'three'
import { InputManager } from './InputManager'
import { Player } from '../entities/Player'
import type { GameEventBus } from '../events/GameEventBus'

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
  private readonly stoppedDirection = new THREE.Vector3()
  private pointerActive = false
  private firing = false
  private virtualFiring = false
  private gameplayEnabled = true
  private activePointerId: number | null = null
  private aimSensitivity = 1
  private readonly events?: GameEventBus

  constructor(input: InputManager, camera: THREE.Camera, player: Player, canvas: HTMLCanvasElement, obstacles: readonly THREE.Box2[], events?: GameEventBus) {
    this.input = input
    this.camera = camera
    this.player = player
    this.canvas = canvas
    this.obstacles = obstacles
    this.events = events
    this.aimPoint.copy(player.position).add(new THREE.Vector3(Math.sin(player.orientation), 0, Math.cos(player.orientation)))
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerleave', this.clearPointer)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerCancel)
    window.addEventListener('blur', this.clearInput)
  }

  updateMovement(deltaTime: number): void {
    if (!this.gameplayEnabled || !this.player.stats.isAlive || this.player.isStaggered) {
      this.input.reset()
      this.cancelAttackInput()
      this.player.update(this.stoppedDirection, deltaTime, this.obstacles)
      return
    }
    const horizontal = this.input.movementHorizontal
    const vertical = this.input.movementVertical
    this.camera.getWorldDirection(this.forward)
    this.forward.y = 0
    this.forward.normalize()
    this.right.crossVectors(this.forward, this.camera.up).normalize()
    this.direction.copy(this.right).multiplyScalar(horizontal).addScaledVector(this.forward, vertical)
    if (this.direction.lengthSq() > 0) this.direction.normalize()
    for (const binding of this.player.abilities.getInputBindings()) {
      if (this.input.consumePressed(binding.inputCode)) {
        const result = this.player.abilities.tryActivate(binding.id, {
          movementDirection: this.player.resolveMovementDirection(this.direction),
        })
        if (result.activated) this.emitAbilityActivated(binding.id)
      }
    }
    this.player.update(this.direction, deltaTime, this.obstacles)
  }

  updateAim(): void {
    if (!this.gameplayEnabled || !this.player.stats.isAlive || !this.pointerActive) return
    const bounds = this.canvas.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return
    this.cursor.set(((this.pointer.x - bounds.left) / bounds.width * 2 - 1) * this.aimSensitivity, (1 - (this.pointer.y - bounds.top) / bounds.height * 2) * this.aimSensitivity)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.cursor, this.camera)
    if (this.raycaster.ray.intersectPlane(this.aimPlane, this.aimPoint)) this.player.facePoint(this.aimPoint)
  }

  get isFiring(): boolean {
    return (this.firing || this.virtualFiring) && this.gameplayEnabled && this.player.stats.isAlive && !this.player.isStaggered
  }

  setAimSensitivity(value: number): void {
    this.aimSensitivity = Number.isFinite(value) ? Math.min(2, Math.max(0.25, value)) : 1
  }

  setVirtualMovement(horizontal: number, vertical: number): void {
    this.input.setVirtualMovement(horizontal, vertical)
  }

  setTouchAim(clientX: number, clientY: number, firing: boolean): void {
    this.pointer.set(clientX, clientY)
    this.pointerActive = true
    this.virtualFiring = firing
  }

  clearTouchAim(): void {
    this.virtualFiring = false
    this.pointerActive = false
  }

  activateAbility(id: string): void {
    if (this.player.isStaggered) return
    const result = this.player.abilities.tryActivate(id, {
      movementDirection: this.player.resolveMovementDirection(this.direction),
    })
    if (result.activated) this.emitAbilityActivated(id)
  }

  private emitAbilityActivated(abilityId: string): void {
    this.events?.emit({
      type: 'dash-activated',
      abilityId,
      position: [this.player.position.x, this.player.position.y + 0.6, this.player.position.z],
    })
  }

  setGameplayEnabled(enabled: boolean): void {
    if (this.gameplayEnabled === enabled) return
    this.gameplayEnabled = enabled
    if (!enabled) {
      this.input.reset()
      this.clearPointer()
      this.cancelAttackInput()
    }
  }

  cancelAttackInput(): void {
    this.firing = false
    this.virtualFiring = false
    if (this.activePointerId !== null && this.canvas.hasPointerCapture?.(this.activePointerId)) {
      try {
        this.canvas.releasePointerCapture(this.activePointerId)
      } catch {
        this.activePointerId = null
      }
    }
    this.activePointerId = null
  }

  getAimPoint(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.aimPoint)
  }

  private updatePointer(event: PointerEvent): void {
    this.pointer.set(event.clientX, event.clientY)
    this.pointerActive = true
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.gameplayEnabled || !this.player.stats.isAlive || event.button !== 0 || !event.isPrimary) return
    this.updatePointer(event)
    this.firing = true
    this.activePointerId = event.pointerId
    try {
      this.canvas.setPointerCapture?.(event.pointerId)
    } catch {
      this.firing = true
    }
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.updatePointer(event)
  }

  private readonly clearPointer = (): void => {
    this.pointerActive = false
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return
    if (this.activePointerId === event.pointerId) this.cancelAttackInput()
  }

  private readonly onPointerCancel = (): void => {
    this.cancelAttackInput()
  }

  private readonly clearInput = (): void => {
    this.clearPointer()
    this.input.reset()
    this.cancelAttackInput()
  }

  dispose(): void {
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerleave', this.clearPointer)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerCancel)
    window.removeEventListener('blur', this.clearInput)
  }
}