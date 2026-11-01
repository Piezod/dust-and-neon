import { TouchControls } from './TouchControls'
import type { PlayerController } from '../core/PlayerController'

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
    controls.reset()
    check(harness.clearedAim > 0 && harness.movement.horizontal === 0, 'Explicit reset clears both active touch pointers')
  } finally {
    controls.destroy()
    host.remove()
  }
  return `${checks} touch-control checks passed`
}
