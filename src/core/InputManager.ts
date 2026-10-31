export class InputManager {
  private readonly keyboardTarget: EventTarget
  private readonly keys = new Set<string>()
  private readonly justPressed = new Set<string>()
  private readonly movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])

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
  }

  dispose(): void {
    this.keyboardTarget.removeEventListener('keydown', this.onKeyDown)
    this.keyboardTarget.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.clear)
    document.removeEventListener('visibilitychange', this.clear)
    this.clear()
  }
}