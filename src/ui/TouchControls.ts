import type { PlayerController } from '../core/PlayerController'
import type { AbilityState } from '../abilities/Ability.types'
import { TOUCH_CONTROL_CONFIG } from '../config/touchControls.config'
import { DEFAULT_GAME_SETTINGS, type GameSettings } from '../core/GameSettings.types'

export interface TouchAbilityBinding {
  readonly id: string
  readonly label: string
}

export interface TouchControlsActions {
  readonly onPause: () => void
}

export class TouchControls {
  readonly root = document.createElement('section')
  private readonly controller: PlayerController
  private readonly movementPad: HTMLElement
  private readonly movementKnob: HTMLElement
  private readonly aimPad: HTMLElement
  private readonly aimKnob: HTMLElement
  private movementPointer: number | null = null
  private aimPointer: number | null = null
  private movementOrigin = { x: 0, y: 0 }
  private aimOrigin = { x: 0, y: 0 }
  private readonly actions: TouchControlsActions
  private readonly events = new AbortController()
  private settings = DEFAULT_GAME_SETTINGS
  private readonly abilityPointers = new Map<number, HTMLButtonElement>()

  constructor(container: HTMLElement, controller: PlayerController, abilities: readonly TouchAbilityBinding[], actions: TouchControlsActions = { onPause: () => undefined }) {
    this.controller = controller
    this.actions = actions
    this.root.className = 'touch-controls'
    this.root.setAttribute('aria-label', 'Controles tactiles')
    this.root.innerHTML = `
      <div class="touch-stick touch-stick--aim" aria-label="Apuntar y disparar"><span class="touch-stick__ring"><i></i></span><span class="touch-control-label">APUNTAR / FUEGO</span></div>
      <div class="touch-stick touch-stick--move" aria-label="Movimiento"><span class="touch-stick__ring"><i></i></span><span class="touch-control-label">MOVER</span></div>
      <div class="touch-ability-list" aria-label="Habilidades"></div>
      <button class="touch-pause" type="button" aria-label="Pausar partida" title="Pausar partida">II</button>
      <button class="touch-fullscreen" type="button" aria-label="Pantalla completa" title="Pantalla completa" hidden>&#x26F6;</button>
    `
    this.movementPad = this.root.querySelector<HTMLElement>('.touch-stick--move')!
    this.movementKnob = this.movementPad.querySelector<HTMLElement>('.touch-stick__ring i')!
    this.aimPad = this.root.querySelector<HTMLElement>('.touch-stick--aim')!
    this.aimKnob = this.root.querySelector<HTMLElement>('.touch-stick--aim i')!
    const abilityList = this.root.querySelector<HTMLElement>('.touch-ability-list')!
    for (const ability of abilities) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'touch-ability'
      button.dataset.abilityId = ability.id
      button.dataset.label = ability.id === 'dash' ? 'DASH' : ability.label
      button.setAttribute('aria-label', `Activar ${ability.label}`)
      button.title = `Activar ${ability.label}`
      button.textContent = button.dataset.label
      abilityList.append(button)
    }
    container.append(this.root)
    this.root.querySelector<HTMLButtonElement>('.touch-fullscreen')!.hidden = !document.fullscreenEnabled
    const options = { signal: this.events.signal }
    this.root.addEventListener('pointerdown', this.onPointerDown, options)
    this.root.addEventListener('pointermove', this.onPointerMove, options)
    this.root.addEventListener('pointerup', this.onPointerEnd, options)
    this.root.addEventListener('pointercancel', this.onPointerEnd, options)
    this.root.addEventListener('lostpointercapture', this.onPointerEnd, options)
    this.root.addEventListener('click', this.onClick, options)
    window.addEventListener('pointerup', this.onPointerEnd, options)
    window.addEventListener('pointercancel', this.onPointerEnd, options)
    window.addEventListener('blur', this.reset, options)
    document.addEventListener('visibilitychange', this.onVisibilityChange, options)
  }

  destroy(): void {
    this.events.abort()
    this.reset()
    this.root.remove()
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary && event.pointerType !== 'touch') return
    const target = event.target instanceof Element ? event.target : null
    const ability = target?.closest<HTMLButtonElement>('.touch-ability')
    if (ability) {
      if (!ability.disabled && ability.dataset.abilityId) {
        this.abilityPointers.set(event.pointerId, ability)
        ability.classList.add('is-pressed')
        this.capturePointer(event.pointerId)
        this.controller.activateAbility(ability.dataset.abilityId)
      }
      event.preventDefault()
      return
    }
    if (event.pointerId === this.movementPointer || event.pointerId === this.aimPointer) return
    if (target?.closest('.touch-stick--move') && this.movementPointer === null) {
      this.movementPointer = event.pointerId
      const bounds = this.movementPad.getBoundingClientRect()
      this.movementOrigin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      this.capturePointer(event.pointerId)
      this.updateMovement(event.clientX, event.clientY)
      event.preventDefault()
      return
    }
    if (target?.closest('.touch-stick--aim') && this.aimPointer === null) {
      this.aimPointer = event.pointerId
      const bounds = this.aimPad.getBoundingClientRect()
      this.aimOrigin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      this.capturePointer(event.pointerId)
      this.updateAim(event.clientX, event.clientY)
      event.preventDefault()
    }
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.movementPointer) {
      this.updateMovement(event.clientX, event.clientY)
      event.preventDefault()
    } else if (event.pointerId === this.aimPointer) {
      this.updateAim(event.clientX, event.clientY)
      event.preventDefault()
    }
  }

  private readonly onPointerEnd = (event: PointerEvent): void => {
    this.abilityPointers.get(event.pointerId)?.classList.remove('is-pressed')
    this.abilityPointers.delete(event.pointerId)
    if (event.pointerId === this.movementPointer) {
      this.movementPointer = null
      this.controller.setVirtualMovement(0, 0)
      this.movementKnob.style.transform = 'translate(0, 0)'
    }
    if (event.pointerId === this.aimPointer) {
      this.aimPointer = null
      this.controller.clearTouchAim()
      this.aimKnob.style.transform = 'translate(0, 0)'
    }
    this.releasePointer(event.pointerId)
  }

  private readonly onClick = (event: MouseEvent): void => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.touch-ability') : null
    const id = button?.dataset.abilityId
    if (id && event.detail === 0) this.controller.activateAbility(id)
    else if (event.target instanceof Element && event.target.closest('.touch-pause')) this.actions.onPause()
    else if (event.target instanceof Element && event.target.closest('.touch-fullscreen')) {
      const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()
      request?.catch(() => undefined)
    }
  }

  private updateMovement(clientX: number, clientY: number): void {
    const bounds = this.movementPad.getBoundingClientRect()
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) * TOUCH_CONTROL_CONFIG.movementRadiusRatio)
    let x = clientX - this.movementOrigin.x
    let y = clientY - this.movementOrigin.y
    const distance = Math.hypot(x, y)
    if (distance > radius) {
      x = x / distance * radius
      y = y / distance * radius
    }
    const deadzone = this.settings.touchDeadzone
    const magnitude = Math.hypot(x, y) / radius
    const scale = magnitude <= deadzone ? 0 : (magnitude - deadzone) / (1 - deadzone) / Math.max(magnitude, 0.001)
    this.controller.setVirtualMovement(x / radius * scale, -y / radius * scale)
    this.movementKnob.style.transform = `translate(${x}px, ${y}px)`
  }

  private updateAim(clientX: number, clientY: number): void {
    const bounds = this.aimPad.getBoundingClientRect()
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) * TOUCH_CONTROL_CONFIG.aimRadiusRatio)
    let x = clientX - this.aimOrigin.x
    let y = clientY - this.aimOrigin.y
    const distance = Math.hypot(x, y)
    if (distance > radius) {
      x = x / distance * radius
      y = y / distance * radius
    }
    const magnitude = Math.hypot(x, y) / radius
    const firing = magnitude * this.settings.touchAimSensitivity > this.settings.touchDeadzone
    this.aimKnob.style.transform = `translate(${x}px, ${y}px)`
    this.controller.setTouchAim(firing ? x / radius : 0, firing ? -y / radius : 0, firing)
  }

  updateAbilities(states: readonly AbilityState[]): void {
    for (const state of states) {
      const button = this.root.querySelector<HTMLButtonElement>(`.touch-ability[data-ability-id="${CSS.escape(state.id)}"]`)
      if (!button) continue
      button.disabled = !state.available
      button.dataset.status = state.available ? 'ready' : state.active ? 'active' : 'cooldown'
      button.textContent = state.active ? 'ACTIVA' : state.cooldownRemaining > 0 ? `${state.cooldownRemaining.toFixed(1)}s` : button.dataset.label ?? state.name
      button.title = state.detail ?? `${state.name} · ${state.energyCost} energia`
      button.setAttribute('aria-label', state.detail ?? `Activar ${state.name}, coste ${state.energyCost} energia`)
    }
  }

  applySettings(settings: GameSettings): void {
    this.settings = settings
    this.root.style.setProperty('--joystick-size', `${settings.joystickSize}px`)
    this.root.style.setProperty('--touch-opacity', String(settings.touchOpacity))
  }

  private capturePointer(pointerId: number): void {
    try {
      this.root.setPointerCapture(pointerId)
    } catch {
      return
    }
  }

  reset = (): void => {
    for (const [pointer, button] of this.abilityPointers) {
      button.classList.remove('is-pressed')
      this.releasePointer(pointer)
    }
    this.abilityPointers.clear()
    this.releasePointer(this.movementPointer)
    this.releasePointer(this.aimPointer)
    this.movementPointer = null
    this.aimPointer = null
    this.controller.setVirtualMovement(0, 0)
    this.controller.clearTouchAim()
    this.movementKnob.style.transform = 'translate(0, 0)'
    this.aimKnob.style.transform = 'translate(0, 0)'
  }

  private releasePointer(pointerId: number | null): void {
    if (pointerId === null || !this.root.hasPointerCapture?.(pointerId)) return
    try { this.root.releasePointerCapture(pointerId) } catch { /* The browser may already have released it. */ }
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.reset()
  }
}
