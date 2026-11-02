import { TouchControls } from './TouchControls'
import type { PlayerController } from '../core/PlayerController'
import { PlayerController as Controller } from '../core/PlayerController'
import { InputManager } from '../core/InputManager'
import { Player } from '../entities/Player'
import * as THREE from 'three'
import { DEFAULT_GAME_SETTINGS } from '../core/GameSettings.types'
import { getCameraViewHeight } from '../config/camera.config'
import { SettingsStore } from '../app/SettingsStore'

interface TouchHarness {
  movement: { horizontal: number; vertical: number }
  aim: { x: number; y: number; firing: boolean } | null
  clearedAim: number
  activated: string[]
}

export function runTouchControlsChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:8px;top:8px;width:820px;height:420px;z-index:10000'
  document.body.append(host)
  const harness: TouchHarness = { movement: { horizontal: 0, vertical: 0 }, aim: null, clearedAim: 0, activated: [] }
  const controller = {
    setVirtualMovement: (horizontal: number, vertical: number) => { harness.movement = { horizontal, vertical } },
    setTouchAim: (x: number, y: number, firing: boolean) => { harness.aim = { x, y, firing } },
    clearTouchAim: () => { harness.aim = null; harness.clearedAim++ },
    activateAbility: (id: string) => { harness.activated.push(id) },
  } as unknown as PlayerController
  let pauseCount = 0
  const controls = new TouchControls(host, controller, [{ id: 'dash', label: 'DASH' }], { onPause: () => pauseCount++ })
  controls.root.style.display = 'block'
  const observedPointerMoves: number[] = []
  controls.root.addEventListener('pointermove', (event) => observedPointerMoves.push((event as PointerEvent).pointerId))
  try {
    const movementPad = host.querySelector<HTMLElement>('.touch-stick--move')!
    const aimPad = host.querySelector<HTMLElement>('.touch-stick--aim')!
    const moveBounds = movementPad.getBoundingClientRect()
    const aimBounds = aimPad.getBoundingClientRect()
    const movementCenter = { x: moveBounds.left + moveBounds.width / 2, y: moveBounds.top + moveBounds.height / 2 }
    const aimCenter = { x: aimBounds.left + aimBounds.width / 2, y: aimBounds.top + aimBounds.height / 2 }
    movementPad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 31, pointerType: 'touch', button: 0, clientX: movementCenter.x, clientY: movementCenter.y }))
    aimPad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 72, pointerType: 'touch', button: 0, clientX: aimCenter.x, clientY: aimCenter.y }))
    const pointerState = controls as unknown as { movementPointer: number | null; aimPointer: number | null }
    check(pointerState.movementPointer === 31 && pointerState.aimPointer === 72, `Each joystick captures its own pointer (${JSON.stringify(pointerState)})`)
    check(harness.aim !== null && !harness.aim.firing, 'Right aim stick does not fire inside its deadzone')
    movementPad.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 31, pointerType: 'touch', clientX: movementCenter.x + 42, clientY: movementCenter.y }))
    const aimRadius = Math.min(aimBounds.width, aimBounds.height) * 0.34
    aimPad.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 72, pointerType: 'touch', clientX: aimCenter.x + aimRadius * 0.6, clientY: aimCenter.y }))
    check(harness.movement.horizontal > 0.5 && harness.aim?.firing === true, `Independent pointer IDs support simultaneous movement and aim/fire (${JSON.stringify({ harness, observedPointerMoves, pointerState })})`)
    check(movementPad.querySelector<HTMLElement>('i')!.style.transform !== 'translate(0, 0)', 'Movement updates its own knob')
    const dashButton = host.querySelector<HTMLButtonElement>('.touch-ability')!
    dashButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 99, pointerType: 'touch', button: 0 }))
    check(harness.activated.length === 1 && harness.aim?.firing === true && harness.movement.horizontal > 0.5, 'Third contact requests Dash immediately without interrupting either stick')
    controls.root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 99, pointerType: 'touch' }))
    check(harness.aim?.firing === true && harness.movement.horizontal > 0.5, 'Releasing Dash preserves both sticks')
    movementPad.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 31, pointerType: 'touch', clientX: movementCenter.x + 25, clientY: movementCenter.y }))
    check(harness.movement.horizontal > 0 && harness.movement.horizontal < 1 && harness.aim?.firing === true, 'Partial movement stays analog and does not stop firing')
    const heldMovement = harness.movement.horizontal
    aimPad.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 72, pointerType: 'touch', button: 0 }))
    check(harness.movement.horizontal === heldMovement && harness.aim === null, 'Ending one pointer leaves the other joystick held')
    movementPad.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 31, pointerType: 'touch' }))
    check(harness.movement.horizontal === 0 && harness.movement.vertical === 0, 'Pointer cancel releases movement')
    host.querySelector<HTMLButtonElement>('.touch-ability')!.click()
    host.querySelector<HTMLButtonElement>('.touch-pause')!.click()
    check(harness.activated[0] === 'dash' && pauseCount === 1, 'Ability and pause buttons invoke their callbacks')
    controls.updateAbilities([{ id: 'dash', name: 'Dash', inputLabel: 'DASH', active: false, available: false, energySufficient: true, cooldownRemaining: 1.4, energyCost: 20 }])
    const dash = host.querySelector<HTMLButtonElement>('.touch-ability')!
    check(dash.disabled && dash.textContent === '1.4s', 'Touch ability button reflects cooldown state')
    controls.updateAbilities([{ id: 'dash', name: 'Dash', inputLabel: 'DASH', active: false, available: false, energySufficient: false, cooldownRemaining: 0, energyCost: 20 }])
    check(dash.disabled, 'Insufficient energy disables Dash')
    movementPad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 80, pointerType: 'touch', button: 0, clientX: movementCenter.x + 40, clientY: movementCenter.y }))
    controls.root.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 80, pointerType: 'touch' }))
    check(harness.movement.horizontal === 0, 'Lost capture clears only its owner')
    controls.reset()
    check(harness.clearedAim > 0 && harness.movement.horizontal === 0, 'Explicit reset clears both active touch pointers')
  } finally {
    controls.destroy()
    host.remove()
  }
  const keyboard = new EventTarget()
  const input = new InputManager(keyboard)
  const player = new Player()
  const camera = new THREE.OrthographicCamera(-20, 20, 10, -10, 0.1, 180)
  camera.position.copy(player.position).add(new THREE.Vector3(26, 34, 32))
  camera.lookAt(player.position)
  camera.updateMatrixWorld()
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 400)
  const realController = new Controller(input, camera, player, canvas, [])
  try {
    const start = player.position.clone()
    realController.setVirtualMovement(0.25, 0)
    realController.updateMovement(0.05)
    const slow = player.position.distanceTo(start)
    const next = player.position.clone()
    realController.setVirtualMovement(1, 0)
    realController.updateMovement(0.05)
    check(Math.abs(player.position.distanceTo(next) / slow - 4) < 0.001, 'Quarter stick produces quarter movement speed through real Player')
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4
      realController.setTouchAim(Math.cos(angle), Math.sin(angle), true)
      realController.updateAim()
      const projectedPlayer = player.position.clone().project(camera)
      const projectedAim = realController.getAimPoint(new THREE.Vector3()).project(camera).sub(projectedPlayer)
      const screen = new THREE.Vector2(projectedAim.x * 2, projectedAim.y).normalize()
      check(screen.dot(new THREE.Vector2(Math.cos(angle), Math.sin(angle))) > 0.999, `Touch aim projects correctly at ${index * 45} degrees`)
    }
    check(realController.isFiring, 'Touch hold reaches shared firing action')
    realController.activateAbility('dash')
    const energy = player.stats.currentEnergy
    realController.updateMovement(0.05)
    check(player.stats.currentEnergy === energy - 20 && realController.isFiring && input.movementHorizontal === 1, 'Real Dash spends configured energy while moving and firing')
    realController.clearTouchAim()
    check(!realController.isFiring, 'Releasing aim stops shared firing action')
    realController.setTouchAim(1, 0, true)
    realController.setGameplayEnabled(false)
    check(!realController.isFiring && input.movementHorizontal === 0 && !input.touchAim.active, 'Pause clears gameplay actions')
    realController.setGameplayEnabled(true)
    check(!realController.isFiring, 'Resume does not resurrect held inputs')
    keyboard.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    check(input.movementVertical === 1, 'Desktop keyboard still works')
    input.reset()
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, button: 0, isPrimary: true, pointerType: 'mouse', clientX: 600, clientY: 200 }))
    check(realController.isFiring, 'Desktop mouse still fires')
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 5, button: 0, pointerType: 'mouse' }))
    check(!realController.isFiring, 'Desktop mouse release stops fire')
    const wall = new THREE.Box2(new THREE.Vector2(player.position.x + 0.6, player.position.z - 5), new THREE.Vector2(player.position.x + 2, player.position.z + 5))
    player.abilities.cancelAll()
    player.update(new THREE.Vector3(1, 0, 0), 1, [wall])
    check(player.position.x + player.radius <= wall.min.x + 0.001, 'Analog route preserves player collision bounds')
    for (const [width, height] of [[667, 375], [844, 390], [932, 430], [915, 412], [1280, 720]]) {
      const mobile = getCameraViewHeight(width!, height!, true, 1)
      const desktop = getCameraViewHeight(width!, height!, false, 1)
      check(mobile < desktop && mobile > 0, `Mobile frustum is closer at ${width}x${height}`)
      check(Math.abs(getCameraViewHeight(width!, height!, true, 1.5) * 1.5 - mobile) < 0.001, 'Mobile zoom is independently configurable')
    }
    const settings = new SettingsStore(null)
    const sanitized = settings.update({ joystickSize: 999, mobileZoom: Number.NaN, touchDeadzone: -1 })
    check(sanitized.joystickSize === 156 && sanitized.mobileZoom === DEFAULT_GAME_SETTINGS.mobileZoom && sanitized.touchDeadzone === 0.05, 'Mobile settings clamp malformed values')
  } finally {
    realController.dispose()
    input.dispose()
    player.dispose()
  }
  return `${checks} touch-control checks passed`
}
