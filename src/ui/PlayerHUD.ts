import type { CharacterStats } from '../core/CharacterStats'
import type { StatKey, StatModifier } from '../core/CharacterStats.types'
import './player-hud.css'

const DEBUG_MODIFIERS = {
  speed: { id: 'hud.debug.speed-20', stat: 'moveSpeed', percentage: 0.2 },
  damage: { id: 'hud.debug.damage-50', stat: 'attackDamage', percentage: 0.5 },
} as const satisfies Record<string, StatModifier>

const DEBUG_STATS: readonly { key: StatKey; label: string }[] = [
  { key: 'moveSpeed', label: 'Velocidad' },
  { key: 'attackDamage', label: 'Dano' },
  { key: 'defense', label: 'Defensa' },
  { key: 'criticalChance', label: 'Critico' },
]

export class PlayerHUD {
  private readonly root = document.createElement('section')
  private readonly stats: CharacterStats
  private readonly panel: HTMLElement
  private readonly healthBar: HTMLElement
  private readonly energyBar: HTMLElement
  private readonly readouts = new Map<string, HTMLElement[]>()
  private readonly toggles: HTMLInputElement[]
  private readonly events = new AbortController()
  private readonly numberFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 2 })
  private previousFocus: HTMLElement | null = null
  private destroyed = false

  constructor(container: HTMLElement, stats: CharacterStats) {
    this.stats = stats
    this.root.className = 'player-hud'
    this.root.setAttribute('aria-label', 'Estadisticas del personaje')
    this.root.innerHTML = `
      <section class="hud-debug" aria-label="Depuracion del personaje" tabindex="-1" hidden>
        <header class="hud-debug__header"><h2>DIAGNOSTICO</h2><button type="button" data-action="close" aria-label="Cerrar panel" title="Cerrar panel">&times;</button></header>
        <dl class="hud-debug__resources">
          <div><dt>Vida</dt><dd data-value="health"></dd></div>
          <div><dt>Energia</dt><dd data-value="energy"></dd></div>
        </dl>
        <table class="hud-debug__stats">
          <thead><tr><th scope="col">Estadistica</th><th scope="col">Base</th><th scope="col">Efectiva</th></tr></thead>
          <tbody>${DEBUG_STATS.map(({ key, label }) => `<tr><th scope="row">${label}</th><td data-value="base-${key}"></td><td data-value="${key}"></td></tr>`).join('')}</tbody>
        </table>
        <div class="hud-debug__actions">
          <button type="button" data-action="damage">Recibir 20 dano</button>
          <button type="button" data-action="heal">Curar 20 vida</button>
          <button type="button" data-action="spend">Consumir 25 energia</button>
          <button type="button" data-action="restore">Recuperar 25 energia</button>
        </div>
        <div class="hud-debug__toggles">
          <label><input type="checkbox" data-modifier="speed">Velocidad +20%</label>
          <label><input type="checkbox" data-modifier="damage">Dano +50%</label>
        </div>
        <button class="hud-debug__refill" type="button" data-action="refill">Restaurar vida y energia</button>
      </section>
      <div class="hud-telemetry">
        <div class="hud-resource hud-resource--health">
          <div class="hud-resource__label"><span>VIDA</span><output data-value="health"></output></div>
          <div class="hud-resource__track" data-bar="health" role="progressbar" aria-label="Vida" aria-valuemin="0"><span></span></div>
        </div>
        <div class="hud-resource hud-resource--energy">
          <div class="hud-resource__label"><span>ENERGIA</span><output data-value="energy"></output></div>
          <div class="hud-resource__track" data-bar="energy" role="progressbar" aria-label="Energia" aria-valuemin="0"><span></span></div>
        </div>
        <dl class="hud-attributes">
          <div><dt>VEL</dt><dd data-value="moveSpeed"></dd></div>
          <div><dt>DANO</dt><dd data-value="attackDamage"></dd></div>
          <div><dt>DEF</dt><dd data-value="defense"></dd></div>
        </dl>
      </div>
    `
    this.panel = this.root.querySelector<HTMLElement>('.hud-debug')!
    this.healthBar = this.root.querySelector<HTMLElement>('[data-bar="health"]')!
    this.energyBar = this.root.querySelector<HTMLElement>('[data-bar="energy"]')!
    this.toggles = Array.from(this.root.querySelectorAll<HTMLInputElement>('[data-modifier]'))
    for (const element of Array.from(this.root.querySelectorAll<HTMLElement>('[data-value]'))) {
      const key = element.dataset.value!
      const entries = this.readouts.get(key) ?? []
      entries.push(element)
      this.readouts.set(key, entries)
    }
    const options = { signal: this.events.signal }
    this.panel.addEventListener('click', this.onAction, options)
    this.panel.addEventListener('change', this.onModifierChange, options)
    for (const name of ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'wheel', 'contextmenu', 'keydown']) {
      this.panel.addEventListener(name, this.stopPropagation, options)
    }
    window.addEventListener('keydown', this.onKeyDown, { ...options, capture: true })
    container.append(this.root)
    this.update()
  }

  update(): void {
    if (this.destroyed) return
    this.updateResource(this.healthBar, 'health', this.stats.currentHealth, this.stats.getStat('maxHealth'))
    this.updateResource(this.energyBar, 'energy', this.stats.currentEnergy, this.stats.getStat('maxEnergy'))
    for (const { key } of DEBUG_STATS) {
      this.setText(key, this.formatStat(key, this.stats.getStat(key)))
      this.setText(`base-${key}`, this.formatStat(key, this.stats.getBaseStat(key)))
    }
    const modifiers = this.stats.getModifiers()
    for (const toggle of this.toggles) {
      const modifier = DEBUG_MODIFIERS[toggle.dataset.modifier as keyof typeof DEBUG_MODIFIERS]
      toggle.checked = modifiers.some((active) => active.id === modifier.id)
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.setDebugOpen(false)
    this.destroyed = true
    this.events.abort()
    for (const modifier of Object.values(DEBUG_MODIFIERS)) this.stats.removeModifier(modifier.id)
    this.root.remove()
  }

  private updateResource(bar: HTMLElement, key: string, current: number, maximum: number): void {
    const ratio = maximum > 0 ? Math.min(1, Math.max(0, current / maximum)) : 0
    const fill = bar.firstElementChild as HTMLElement
    const width = `${ratio * 100}%`
    if (fill.style.width !== width) fill.style.width = width
    bar.setAttribute('aria-valuenow', String(current))
    bar.setAttribute('aria-valuemax', String(maximum))
    this.setText(key, `${this.numberFormat.format(current)} / ${this.numberFormat.format(maximum)}`)
  }

  private setText(key: string, value: string): void {
    for (const element of this.readouts.get(key) ?? []) {
      if (element.textContent !== value) element.textContent = value
    }
  }

  private formatStat(key: StatKey, value: number): string {
    return key === 'criticalChance' ? `${this.numberFormat.format(value * 100)}%` : this.numberFormat.format(value)
  }

  private setDebugOpen(open: boolean): void {
    if (open === !this.panel.hidden) return
    this.panel.hidden = !open
    if (open) {
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      this.update()
      this.panel.focus({ preventScroll: true })
    } else {
      if (this.panel.contains(document.activeElement)) this.previousFocus?.focus({ preventScroll: true })
      this.previousFocus = null
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'F3') return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) this.setDebugOpen(this.panel.hidden)
  }

  private readonly stopPropagation = (event: Event): void => {
    event.stopPropagation()
  }

  private readonly onAction = (event: MouseEvent): void => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null
    if (!button) return
    switch (button.dataset.action) {
      case 'damage': this.stats.takeDamage(20); break
      case 'heal': this.stats.heal(20); break
      case 'spend': this.stats.spendEnergy(25); break
      case 'restore': this.stats.restoreEnergy(25); break
      case 'refill':
        this.stats.heal(this.stats.getStat('maxHealth'))
        this.stats.restoreEnergy(this.stats.getStat('maxEnergy'))
        break
      case 'close': this.setDebugOpen(false); break
    }
    this.update()
  }

  private readonly onModifierChange = (event: Event): void => {
    const toggle = event.target
    if (!(toggle instanceof HTMLInputElement)) return
    const key = toggle.dataset.modifier
    if (key !== 'speed' && key !== 'damage') return
    const modifier = DEBUG_MODIFIERS[key]
    const active = this.stats.getModifiers().some((entry) => entry.id === modifier.id)
    if (toggle.checked && !active) this.stats.addModifier(modifier)
    if (!toggle.checked && active) this.stats.removeModifier(modifier.id)
    this.update()
  }
}