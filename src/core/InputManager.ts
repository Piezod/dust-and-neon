export class InputManager {
  private readonly keyboardTarget: EventTarget
  private readonly keys = new Set<string>()
  private readonly justPressed = new Set<string>()
  private readonly movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])
  private virtualHorizontal = 0
  private virtualVertical = 0
  readonly touchAim = { x: 0, y: 0, active: false, firing: false }
  private readonly requestedAbilities = new Set<string>()

  setTouchAim(x: number, y: number, firing: boolean): void {
    this.touchAim.x = x
    this.touchAim.y = y
    this.touchAim.active = Math.hypot(x, y) > 0
    this.touchAim.firing = firing && this.touchAim.active
  }

  requestAbility(id: string): void {
    this.requestedAbilities.add(id)
  }

  consumeAbility(id: string, inputCode: string): boolean {
    const touch = this.requestedAbilities.delete(id)
    return this.consumePressed(inputCode) || touch
  }

  constructor(keyboardTarget: EventTarget = window) {
    this.keyboardTarget = keyboardTarget
    this.keyboardTarget.addEventListener('keydown', this.onKeyDown)
    this.keyboardTarget.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.clear)
    document.addEventListener('visibilitychange', this.clear)
  }

  isPressed(code: string): boolean {
    return this.keys.has(code)
  }

  consumePressed(code: string): boolean {
    const pressed = this.justPressed.delete(code)
    return pressed
  }

  get movementHorizontal(): number {
    return Math.max(-1, Math.min(1, Number(this.isPressed('KeyD')) - Number(this.isPressed('KeyA')) + this.virtualHorizontal))
  }

  get movementVertical(): number {
    return Math.max(-1, Math.min(1, Number(this.isPressed('KeyW')) - Number(this.isPressed('KeyS')) + this.virtualVertical))
  }

  setVirtualMovement(horizontal: number, vertical: number): void {
    this.virtualHorizontal = Number.isFinite(horizontal) ? Math.max(-1, Math.min(1, horizontal)) : 0
    this.virtualVertical = Number.isFinite(vertical) ? Math.max(-1, Math.min(1, vertical)) : 0
  }

  reset(): void {
    this.clear()
  }

  private readonly onKeyDown: EventListener = (rawEvent): void => {
    const event = rawEvent as KeyboardEvent
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (!event.repeat && !this.keys.has(event.code) && !this.movementKeys.has(event.code)) this.justPressed.add(event.code)
    this.keys.add(event.code)
    if (this.movementKeys.has(event.code)) event.preventDefault()
  }

  private readonly onKeyUp: EventListener = (rawEvent): void => {
    const event = rawEvent as KeyboardEvent
    this.keys.delete(event.code)
  }

  private readonly clear = (): void => {
    this.keys.clear()
    this.justPressed.clear()
    this.virtualHorizontal = 0
    this.virtualVertical = 0
    this.setTouchAim(0, 0, false)
    this.requestedAbilities.clear()
  }

  dispose(): void {
    this.keyboardTarget.removeEventListener('keydown', this.onKeyDown)
    this.keyboardTarget.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.clear)
    document.removeEventListener('visibilitychange', this.clear)
    this.clear()
  }
}