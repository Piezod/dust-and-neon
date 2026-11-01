import './pause-overlay.css'
import type { GameSettings } from '../core/GameSettings.types'
import { DIFFICULTY_PROFILES } from '../config/difficulty.config'

export type PauseReason = 'user' | 'orientation' | 'hidden'

export interface PauseOverlayActions {
  readonly onResume: () => void
  readonly onExit: () => void
  readonly onSettings: (settings: Partial<GameSettings>) => void
}

export class PauseOverlay {
  readonly root = document.createElement('section')
  private readonly title = document.createElement('h2')
  private readonly message = document.createElement('p')
  private readonly resumeButton = document.createElement('button')
  private readonly difficultySelect = document.createElement('select')
  private readonly difficultyDescription = document.createElement('span')
  private readonly events = new AbortController()
  private readonly actions: PauseOverlayActions

  constructor(container: HTMLElement, settings: GameSettings, actions: PauseOverlayActions) {
    this.actions = actions
    this.root.className = 'pause-overlay'
    this.root.hidden = true
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-modal', 'true')
    this.root.setAttribute('aria-labelledby', 'pause-overlay-title')
    this.title.id = 'pause-overlay-title'
    this.title.className = 'pause-overlay__title'
    this.message.className = 'pause-overlay__message'
    this.resumeButton.type = 'button'
    this.resumeButton.className = 'pause-overlay__action pause-overlay__action--primary'
    this.resumeButton.textContent = 'CONTINUAR'
    this.resumeButton.dataset.action = 'resume'
    this.difficultySelect.className = 'pause-overlay__difficulty-select'
    this.difficultySelect.dataset.setting = 'difficulty'
    this.difficultySelect.setAttribute('aria-label', 'Dificultad')
    const profiles = [...DIFFICULTY_PROFILES.map(({ id, label }) => ({ id, label })), { id: 'custom', label: 'Personalizada' }]
    for (const profile of profiles) {
      const option = document.createElement('option')
      option.value = profile.id
      option.textContent = profile.label
      this.difficultySelect.append(option)
    }
    this.difficultySelect.value = settings.difficulty
    this.difficultyDescription.className = 'pause-overlay__difficulty-description'
    this.updateDifficultyDescription(settings.difficulty)
    const difficultyRow = document.createElement('label')
    difficultyRow.className = 'pause-overlay__difficulty'
    const difficultyLabel = document.createElement('span')
    difficultyLabel.textContent = 'DIFICULTAD'
    difficultyRow.append(difficultyLabel, this.difficultySelect, this.difficultyDescription)
    const exitButton = document.createElement('button')
    exitButton.type = 'button'
    exitButton.className = 'pause-overlay__action'
    exitButton.textContent = 'VOLVER AL MENU'
    exitButton.dataset.action = 'exit'
    this.root.append(this.title, this.message, difficultyRow, this.resumeButton, exitButton)
    this.root.addEventListener('click', this.onClick, { signal: this.events.signal })
    this.root.addEventListener('change', this.onChange, { signal: this.events.signal })
    container.append(this.root)
  }

  show(reason: PauseReason): void {
    this.root.hidden = false
    this.root.dataset.reason = reason
    if (reason === 'orientation') {
      this.title.textContent = 'GIRA EL DISPOSITIVO'
      this.message.textContent = 'La partida esta pausada mientras la pantalla esta en vertical.'
      this.resumeButton.hidden = true
    } else if (reason === 'hidden') {
      this.title.textContent = 'PARTIDA EN PAUSA'
      this.message.textContent = 'La partida se pauso al ocultar la pestana.'
      this.resumeButton.hidden = false
    } else {
      this.title.textContent = 'PAUSA'
      this.message.textContent = 'La simulacion esta detenida.'
      this.resumeButton.hidden = false
    }
    this.resumeButton.focus()
  }

  hide(): void {
    this.root.hidden = true
  }

  updateDifficulty(settings: GameSettings): void {
    this.difficultySelect.value = settings.difficulty
    this.updateDifficultyDescription(settings.difficulty)
  }

  destroy(): void {
    this.events.abort()
    this.root.remove()
  }

  private readonly onClick = (event: MouseEvent): void => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null
    if (!button) return
    if (button.dataset.action === 'resume') this.actions.onResume()
    else if (button.dataset.action === 'exit') this.actions.onExit()
  }

  private readonly onChange = (event: Event): void => {
    if (event.target !== this.difficultySelect) return
    const difficulty = this.difficultySelect.value as GameSettings['difficulty']
    this.updateDifficultyDescription(difficulty)
    this.actions.onSettings({ difficulty })
  }

  private updateDifficultyDescription(difficulty: GameSettings['difficulty']): void {
    this.difficultyDescription.textContent = difficulty === 'custom'
      ? 'Personalizada. Cambia en la siguiente oleada o capítulo.'
      : `${DIFFICULTY_PROFILES.find((profile) => profile.id === difficulty)?.description ?? ''} Efecto en el siguiente encuentro.`
  }
}
