export class InputManager {
  private readonly keys = new Set<string>()
  private readonly movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])

  constructor() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.clear)
    document.addEventListener('visibilitychange', this.clear)
  }

  isPressed(code: string): boolean {
    return this.keys.has(code)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.movementKeys.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault()
    this.keys.add(event.code)
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code)
  }

  private readonly clear = (): void => {
    this.keys.clear()
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.clear)
    document.removeEventListener('visibilitychange', this.clear)
    this.clear()
  }
}