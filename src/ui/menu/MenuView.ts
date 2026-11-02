import type { CampaignDefinition } from '../../game-modes/GameMode.types'
import type { InfiniteRunRecord } from '../../game-modes/InfiniteRunRecord'
import type { GameSettings } from '../../core/GameSettings.types'
import type { AchievementState } from '../../achievements/AchievementManager'
import { CUSTOM_DIFFICULTY_RANGES, DIFFICULTY_PROFILES, type DifficultyProfileId } from '../../config/difficulty.config'

export type MenuScreen = 'home' | 'campaign' | 'multiplayer' | 'skills' | 'settings' | 'achievements' | 'game-over' | 'mission-complete'

export interface MenuActions {
  readonly onGesture: () => void
  readonly onCampaign: () => void
  readonly onMultiplayer: () => void
  readonly onInfinite: () => void
  readonly onMission: (missionId: string) => void
  readonly onOpenSettings: () => void
  readonly onSkills: () => void
  readonly onOpenAchievements: () => void
  readonly onBack: () => void
  readonly onRetry: () => void
  readonly onMainMenu: () => void
  readonly onSettings: (settings: Partial<GameSettings>) => void
}

export class MenuView {
  readonly root = document.createElement('main')
  private readonly actions: MenuActions
  private events = new AbortController()
  private toastTimer: number | null = null
  private currentSettings: GameSettings | null = null

  constructor(container: HTMLElement, actions: MenuActions) {
    this.actions = actions
    this.root.className = 'main-menu'
    container.append(this.root)
    this.root.addEventListener('click', this.onClick)
    this.root.addEventListener('input', this.onSettingsInput)
    this.root.addEventListener('change', this.onSettingsInput)
  }

  showHome(record: InfiniteRunRecord, difficultyLabel = 'Normal'): void {
    this.render(`
      <header class="menu-brand"><span class="menu-eyebrow">LAST LIGHT OUTPOST · SECTOR 07</span><h1>DUST <span>&</span> NEON</h1><p>EL DESIERTO NO OLVIDA</p></header>
      <nav class="menu-actions" aria-label="Menu principal">
        <button data-action="campaign"><strong>CAMPANA — HISTORIA</strong><small>Seis capitulos. Seis jefes. Un ultimo tren.</small></button>
        <button data-action="multiplayer"><strong>MULTIJUGADOR — EXPERIMENTAL</strong><small>Cooperativo online · sala privada · dos jugadores</small></button>
        <button data-action="infinite"><strong>MODO INFINITO</strong><small>Record: oleada ${record.bestWave} · puntuacion ${record.bestScore}</small></button>
        <div class="menu-secondary"><button data-action="settings">AJUSTES <small>DIFICULTAD: ${difficultyLabel}</small></button><button data-action="skills">HABILIDADES</button><button data-action="achievements">LOGROS</button></div>
      </nav>
      <footer class="menu-footer">34.08 N / 116.42 W <span>NO SIGNAL BEYOND THIS POINT</span></footer>
    `)
  }

  showCampaign(campaign: CampaignDefinition, isUnlocked: (id: string) => boolean, isCompleted: (id: string) => boolean, difficultyLabel = 'Normal'): void {
    const chapters = campaign.chapters.map((chapter) => `
      <section class="mission-chapter"><p class="menu-eyebrow">${chapter.title}</p>
        ${chapter.missions.map((mission) => `<button class="mission-row" data-action="mission" data-id="${mission.id}" ${isUnlocked(mission.id) ? '' : 'disabled'}><span><strong>${mission.title}</strong><small>${mission.provisional ? 'CONTENIDO PROVISIONAL' : 'CAPITULO'}</small></span><span>${isCompleted(mission.id) ? 'COMPLETADA' : isUnlocked(mission.id) ? 'JUGAR' : 'BLOQUEADA'}</span></button>`).join('')}
      </section>
    `).join('')
    this.render(`<header class="menu-subheader"><button class="back-button" data-action="back">VOLVER</button><span class="menu-eyebrow">${campaign.title}</span><h1>SELECCION DE CAPITULO</h1><p class="menu-difficulty-label">DIFICULTAD ACTUAL · ${difficultyLabel}</p></header><div class="menu-scroll">${chapters}</div>`)
  }

  showSettings(settings: GameSettings): void {
    this.currentSettings = settings
    this.render(`
      <header class="menu-subheader"><button class="back-button" data-action="back">VOLVER</button><span class="menu-eyebrow">PREFERENCIAS DE PARTIDA</span><h1>AJUSTES</h1></header>
      <section class="settings-list">
        <div class="settings-difficulty">
          <label class="settings-row"><span>Dificultad</span><select data-setting="difficulty">${DIFFICULTY_PROFILES.map((profile) => `<option value="${profile.id}" ${settings.difficulty === profile.id ? 'selected' : ''}>${profile.label}</option>`).join('')}<option value="custom" ${settings.difficulty === 'custom' ? 'selected' : ''}>Personalizada</option></select></label>
          <p class="settings-difficulty__description" data-difficulty-description></p>
          <div class="settings-difficulty__custom" data-custom-difficulty ${settings.difficulty === 'custom' ? '' : 'hidden'}>
            ${this.customDifficultyRange('Vida de enemigos', 'enemyHealth', settings.customDifficulty.enemyHealth)}
            ${this.customDifficultyRange('Dano enemigo', 'enemyDamage', settings.customDifficulty.enemyDamage)}
            ${this.customDifficultyRange('Presupuesto de aparicion', 'spawnBudget', settings.customDifficulty.spawnBudget)}
            ${this.customDifficultyRange('Cadencia de ataques', 'attackCooldown', settings.customDifficulty.attackCooldown)}
            ${this.customDifficultyRange('Velocidad de proyectiles', 'projectileSpeed', settings.customDifficulty.projectileSpeed)}
            ${this.customDifficultyRange('Duracion de avisos', 'telegraphDuration', settings.customDifficulty.telegraphDuration)}
            ${this.customDifficultyRange('Recursos recuperables', 'resourceRecovery', settings.customDifficulty.resourceRecovery)}
            <button type="button" class="settings-reset" data-action="difficulty-reset">RESTAURAR PERSONALIZADA</button>
          </div>
          <p class="settings-difficulty__pending">Los cambios durante una partida se aplican en la siguiente oleada o capítulo.</p>
        </div>
        ${this.rangeSetting('Volumen general', 'masterVolume', settings.masterVolume)}
        ${this.rangeSetting('Musica', 'musicVolume', settings.musicVolume)}
        ${this.rangeSetting('Efectos', 'effectsVolume', settings.effectsVolume)}
        <label class="settings-row"><span>Musica activada</span><input type="checkbox" data-setting="musicEnabled" ${settings.musicEnabled ? 'checked' : ''}></label>
        <label class="settings-row"><span>Calidad grafica</span><select data-setting="graphicsQuality"><option value="low" ${settings.graphicsQuality === 'low' ? 'selected' : ''}>Baja</option><option value="medium" ${settings.graphicsQuality === 'medium' ? 'selected' : ''}>Media</option><option value="high" ${settings.graphicsQuality === 'high' ? 'selected' : ''}>Alta</option></select></label>
        ${this.rangeSetting('Sensibilidad de apuntado', 'aimSensitivity', (settings.aimSensitivity - 0.25) / 1.75, '0', '1', '0.01')}
        <label class="settings-row"><span>Controles tactiles</span><input type="checkbox" data-setting="showTouchControls" ${settings.showTouchControls ? 'checked' : ''}></label>
        ${this.mobileRange('Tamano del joystick', 'joystickSize', settings.joystickSize, 96, 156, 2, 'px')}
        ${this.mobileRange('Opacidad tactil', 'touchOpacity', settings.touchOpacity, 0.3, 1, 0.05)}
        ${this.mobileRange('Sensibilidad tactil', 'touchAimSensitivity', settings.touchAimSensitivity, 0.5, 2, 0.05)}
        ${this.mobileRange('Zona muerta tactil', 'touchDeadzone', settings.touchDeadzone, 0.05, 0.35, 0.01)}
        ${this.mobileRange('Zoom movil', 'mobileZoom', settings.mobileZoom, 0.75, 1.5, 0.05)}
      </section>
    `)
    this.updateDifficultyDescription(settings.difficulty)
  }

  showAchievements(achievements: readonly AchievementState[]): void {
    this.render(`<header class="menu-subheader"><button class="back-button" data-action="back">VOLVER</button><span class="menu-eyebrow">REGISTRO DE CAMPO</span><h1>LOGROS</h1></header><section class="achievement-list">${achievements.map((achievement) => `<article class="achievement-row ${achievement.unlocked ? 'is-unlocked' : ''}"><div><strong>${achievement.title}</strong><p>${achievement.description}</p></div><output>${achievement.unlocked ? 'DESBLOQUEADO' : `${achievement.progress}/${achievement.target}`}</output></article>`).join('')}</section>`)
  }

  showEndScreen(kind: 'game-over' | 'mission-complete', details: { readonly wave: number; readonly kills: number; readonly score: number }): void {
    const complete = kind === 'mission-complete'
    this.render(`<section class="end-screen"><span class="menu-eyebrow">${complete ? 'SECTOR ASEGURADO' : 'SENAL PERDIDA'}</span><h1>${complete ? 'CAMPANA COMPLETADA' : 'GAME OVER'}</h1><dl><div><dt>OLEADA</dt><dd>${details.wave}</dd></div><div><dt>BAJAS</dt><dd>${details.kills}</dd></div><div><dt>PUNTUACION</dt><dd>${details.score}</dd></div></dl><div class="menu-secondary"><button data-action="retry">REINTENTAR</button><button data-action="main-menu">VOLVER AL MENU</button></div></section>`)
  }

  notifyAchievement(achievement: AchievementState): void {
    const toast = document.createElement('div')
    toast.className = 'achievement-toast'
    toast.setAttribute('role', 'status')
    toast.innerHTML = `<strong>LOGRO DESBLOQUEADO</strong><span>${achievement.title}</span>`
    this.root.append(toast)
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => {
      toast.remove()
      this.toastTimer = null
    }, 3500)
  }

  destroy(): void {
    this.events.abort()
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer)
    this.root.removeEventListener('click', this.onClick)
    this.root.removeEventListener('input', this.onSettingsInput)
    this.root.removeEventListener('change', this.onSettingsInput)
    this.root.remove()
  }

  private render(content: string): void {
    this.events.abort()
    this.events = new AbortController()
    this.root.innerHTML = `<canvas class="menu-landscape" aria-hidden="true"></canvas><div class="menu-vignette" aria-hidden="true"></div><div class="menu-content">${content}</div>`
    const canvas = this.root.querySelector<HTMLCanvasElement>('.menu-landscape')!
    this.paintDesert(canvas)
    window.addEventListener('resize', this.onResize, { signal: this.events.signal })
  }

  private rangeSetting(label: string, key: string, value: number, min = '0', max = '1', step = '0.01'): string {
    return `<label class="settings-row settings-row--range"><span>${label}<output data-setting-value="${key}">${key === 'aimSensitivity' ? (value * 1.75 + 0.25).toFixed(2) : Math.round(value * 100)}${key === 'aimSensitivity' ? '' : '%'}</output></span><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`
  }

  private mobileRange(label: string, key: string, value: number, min: number, max: number, step: number, unit = 'x'): string {
    return `<label class="settings-row"><span>${label}<output data-setting-value="${key}" data-unit="${unit}">${value}${unit}</output></span><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`
  }

  private paintDesert(canvas: HTMLCanvasElement): void {
    const bounds = this.root.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    canvas.width = Math.max(1, Math.floor(bounds.width * ratio))
    canvas.height = Math.max(1, Math.floor(bounds.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    const width = bounds.width
    const height = bounds.height
    context.fillStyle = '#171a20'
    context.fillRect(0, 0, width, height)
    const sun = context.createRadialGradient(width * 0.72, height * 0.34, 8, width * 0.72, height * 0.34, height * 0.62)
    sun.addColorStop(0, '#d56d4a')
    sun.addColorStop(0.35, '#7f4b4d')
    sun.addColorStop(1, '#171a20')
    context.fillStyle = sun
    context.fillRect(0, 0, width, height)
    context.fillStyle = '#ffdb9a'
    context.globalAlpha = 0.72
    context.beginPath()
    context.arc(width * 0.72, height * 0.35, Math.min(width, height) * 0.095, 0, Math.PI * 2)
    context.fill()
    context.globalAlpha = 1
    this.drawRidge(context, width, height, 0.61, '#56383d', 21, 0.1)
    this.drawRidge(context, width, height, 0.73, '#754743', 13, 0.18)
    this.drawRidge(context, width, height, 0.84, '#a35b45', 18, 0.14)
    context.strokeStyle = '#39d8c0aa'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(width * 0.05, height * 0.89)
    context.bezierCurveTo(width * 0.34, height * 0.77, width * 0.56, height * 0.98, width * 0.88, height * 0.83)
    context.stroke()
    for (let index = 0; index < 18; index++) {
      const x = width * (0.18 + index * 0.035)
      const y = height * (0.72 + Math.sin(index * 2.2) * 0.03)
      context.fillStyle = index % 4 === 0 ? '#31d7c6' : '#2a2428'
      context.fillRect(x, y, 4 + index % 4, height * (0.08 + index % 3 * 0.025))
    }
  }

  private drawRidge(context: CanvasRenderingContext2D, width: number, height: number, horizon: number, color: string, seed: number, amplitude: number): void {
    context.fillStyle = color
    context.beginPath()
    context.moveTo(0, height)
    for (let index = 0; index <= 24; index++) {
      const x = width * index / 24
      const wave = Math.sin(index * seed) * Math.cos(index * seed * 0.37) * height * amplitude
      context.lineTo(x, height * horizon + wave)
    }
    context.lineTo(width, height)
    context.closePath()
    context.fill()
  }

  private readonly onResize = (): void => {
    const canvas = this.root.querySelector<HTMLCanvasElement>('.menu-landscape')
    if (canvas) this.paintDesert(canvas)
  }

  private readonly onClick = (event: MouseEvent): void => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null
    if (!button || button.disabled) return
    this.actions.onGesture()
    const id = button.dataset.id ?? ''
    switch (button.dataset.action) {
      case 'campaign': this.actions.onCampaign(); break
      case 'multiplayer': this.actions.onMultiplayer(); break
      case 'infinite': this.actions.onInfinite(); break
      case 'mission': this.actions.onMission(id); break
      case 'settings': this.actions.onOpenSettings(); break
      case 'skills': this.actions.onSkills(); break
      case 'achievements': this.actions.onOpenAchievements(); break
      case 'back': this.actions.onBack(); break
      case 'retry': this.actions.onRetry(); break
      case 'main-menu': this.actions.onMainMenu(); break
      case 'difficulty-reset': this.resetCustomDifficulty(); break
    }
  }

  private readonly onSettingsInput = (event: Event): void => {
    const input = event.target
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return
    const key = input.dataset.setting as keyof GameSettings | undefined
    if (!key) return
    if (key === 'difficulty' && input instanceof HTMLSelectElement) {
      const difficulty = input.value as DifficultyProfileId
      this.currentSettings = this.currentSettings ? { ...this.currentSettings, difficulty } : null
      this.actions.onSettings({ difficulty })
      this.updateDifficultyDescription(difficulty)
      return
    }
    if (key.startsWith('customDifficulty.') && input instanceof HTMLInputElement && input.type === 'range') {
      const customKey = key.slice('customDifficulty.'.length) as keyof GameSettings['customDifficulty']
      const customDifficulty = { ...this.currentSettings?.customDifficulty, [customKey]: Number(input.value) } as GameSettings['customDifficulty']
      this.currentSettings = this.currentSettings ? { ...this.currentSettings, customDifficulty } : null
      this.actions.onSettings({ customDifficulty })
      const output = this.root.querySelector<HTMLOutputElement>(`[data-setting-value="${key}"]`)
      if (output) output.value = `${Number(input.value).toFixed(2)}x`
      return
    }
    if (input instanceof HTMLInputElement && input.type === 'checkbox') {
      this.actions.onSettings({ [key]: input.checked } as Partial<GameSettings>)
    } else if (input instanceof HTMLInputElement && input.type === 'range') {
      const value = Number(input.value)
      const settingsValue = key === 'aimSensitivity' ? value * 1.75 + 0.25 : value
      this.actions.onSettings({ [key]: settingsValue } as Partial<GameSettings>)
      const output = this.root.querySelector<HTMLOutputElement>(`[data-setting-value="${key}"]`)
      if (output) output.value = output.dataset.unit ? `${settingsValue.toFixed(2)}${output.dataset.unit}` : key === 'aimSensitivity' ? settingsValue.toFixed(2) : `${Math.round(settingsValue * 100)}%`
    } else {
      this.actions.onSettings({ [key]: input.value } as Partial<GameSettings>)
    }
  }

  private customDifficultyRange(label: string, key: keyof GameSettings['customDifficulty'], value: number): string {
    const [minimum, maximum] = CUSTOM_DIFFICULTY_RANGES[key]
    return `<label class="settings-row settings-row--range"><span>${label}<output data-setting-value="customDifficulty.${key}">${value.toFixed(2)}x</output></span><input type="range" data-setting="customDifficulty.${key}" min="${minimum}" max="${maximum}" step="0.05" value="${value}" ${this.currentSettings?.difficulty === 'custom' ? '' : 'disabled'}></label>`
  }

  private updateDifficultyDescription(id: DifficultyProfileId): void {
    const description = id === 'custom' ? 'Ajustes avanzados limitados a rangos seguros.' : DIFFICULTY_PROFILES.find((profile) => profile.id === id)?.description ?? ''
    const output = this.root.querySelector<HTMLElement>('[data-difficulty-description]')
    if (output) output.textContent = description
    const custom = this.root.querySelector<HTMLElement>('[data-custom-difficulty]')
    if (custom) custom.hidden = id !== 'custom'
    this.root.querySelectorAll<HTMLInputElement>('[data-setting^="customDifficulty."]').forEach((input) => { input.disabled = id !== 'custom' })
  }

  private resetCustomDifficulty(): void {
    if (!this.currentSettings) return
    const customDifficulty = {
      enemyHealth: 1, enemyDamage: 1, spawnBudget: 1, attackCooldown: 1,
      projectileSpeed: 1, telegraphDuration: 1, resourceRecovery: 1,
    }
    this.currentSettings = { ...this.currentSettings, customDifficulty }
    this.actions.onSettings({ customDifficulty })
    for (const [key, value] of Object.entries(customDifficulty)) {
      const input = this.root.querySelector<HTMLInputElement>(`[data-setting="customDifficulty.${key}"]`)
      const output = this.root.querySelector<HTMLOutputElement>(`[data-setting-value="customDifficulty.${key}"]`)
      if (input) input.value = String(value)
      if (output) output.value = `${value.toFixed(2)}x`
    }
  }
}
