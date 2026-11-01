import type { RunState } from '../progression/RunState'
import type { WaveManager } from '../waves/WaveManager'
import './intermission-panel.css'

export class IntermissionPanel {
  private readonly root = document.createElement('section')
  private readonly waves: WaveManager
  private readonly runState: RunState
  private readonly events = new AbortController()
  private readonly upgradeButtons = new Map<string, HTMLButtonElement>()
  private readonly upgradeLevels = new Map<string, HTMLElement>()
  private readonly perkButtons = new Map<string, HTMLButtonElement>()
  private readonly perkStates = new Map<string, HTMLElement>()
  private readonly summary: HTMLElement
  private readonly walletReadout: HTMLElement
  private readonly notice: HTMLElement
  private destroyed = false

  constructor(container: HTMLElement, waves: WaveManager, runState: RunState) {
    this.waves = waves
    this.runState = runState
    this.root.className = 'intermission'
    this.root.setAttribute('aria-label', 'Mejoras entre oleadas')
    this.root.hidden = true
    this.root.innerHTML = `
      <section class="intermission__panel" role="dialog" aria-modal="true" aria-labelledby="intermission-title">
        <header class="intermission__header">
          <div><p class="intermission__eyebrow">LAST LIGHT OUTPOST</p><h2 id="intermission-title">INTERMISION</h2></div>
          <output class="intermission__wallet" data-wallet></output>
        </header>
        <p class="intermission__summary" data-summary></p>
        <section class="intermission__section" aria-labelledby="upgrades-title">
          <h3 id="upgrades-title">MEJORAS</h3><div class="intermission__list" data-upgrades></div>
        </section>
        <section class="intermission__section" aria-labelledby="perks-title">
          <h3 id="perks-title">PERK · ELIGE UNO</h3><div class="intermission__list" data-perks></div>
        </section>
        <p class="intermission__notice" aria-live="polite" data-notice></p>
        <footer class="intermission__footer"><span>LA SIMULACION ESTA PAUSADA</span><button type="button" data-action="continue">CONTINUAR</button></footer>
      </section>
    `
    this.summary = this.root.querySelector<HTMLElement>('[data-summary]')!
    this.walletReadout = this.root.querySelector<HTMLElement>('[data-wallet]')!
    this.notice = this.root.querySelector<HTMLElement>('[data-notice]')!
    this.createUpgradeRows()
    this.createPerkRows()
    this.root.addEventListener('click', this.onClick, { signal: this.events.signal })
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'contextmenu', 'keydown']) {
      this.root.addEventListener(type, this.stopPropagation, { signal: this.events.signal })
    }
    container.append(this.root)
    this.update()
  }

  update(): void {
    if (this.destroyed) return
    const snapshot = this.waves.getSnapshot()
    const open = snapshot.state === 'upgrades'
    if (this.root.hidden === open) {
      this.root.hidden = !open
      if (open) this.root.querySelector<HTMLButtonElement>('[data-action="continue"]')?.focus({ preventScroll: true })
    }
    if (!open) return
    this.summary.textContent = `OLEADA ${snapshot.waveNumber} COMPLETADA · ${snapshot.enemiesRemaining} ENEMIGOS RESTANTES`
    this.walletReadout.textContent = `ORO ${this.runState.wallet.balance}`
    for (const state of this.runState.upgrades.getStates()) {
      const button = this.upgradeButtons.get(state.id)
      const level = this.upgradeLevels.get(state.id)
      if (!button || !level) continue
      button.disabled = !state.canPurchase
      level.textContent = `NIVEL ${state.level}/${state.maxLevel} · ${state.cost} ORO`
    }
    for (const state of this.runState.perks.getStates()) {
      const button = this.perkButtons.get(state.id)
      const status = this.perkStates.get(state.id)
      if (!button || !status) continue
      button.disabled = !state.canSelect
      status.textContent = state.selectedThisIntermission ? 'ELEGIDO' : `POSEIDOS ${state.stacks}/${state.maxStacks}`
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.events.abort()
    this.root.remove()
  }

  private createUpgradeRows(): void {
    const list = this.root.querySelector<HTMLElement>('[data-upgrades]')!
    for (const definition of this.runState.upgrades.getDefinitions()) {
      const row = document.createElement('div')
      row.className = 'intermission__row'
      const details = document.createElement('div')
      const name = document.createElement('strong')
      name.textContent = definition.name
      const description = document.createElement('span')
      description.textContent = definition.description
      const level = document.createElement('small')
      details.append(name, description, level)
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.action = 'upgrade'
      button.dataset.id = definition.id
      button.textContent = 'COMPRAR'
      row.append(details, button)
      list.append(row)
      this.upgradeButtons.set(definition.id, button)
      this.upgradeLevels.set(definition.id, level)
    }
  }

  private createPerkRows(): void {
    const list = this.root.querySelector<HTMLElement>('[data-perks]')!
    for (const definition of this.runState.perks.getDefinitions()) {
      const row = document.createElement('div')
      row.className = 'intermission__row'
      const details = document.createElement('div')
      const name = document.createElement('strong')
      name.textContent = definition.name
      const description = document.createElement('span')
      description.textContent = definition.description
      const status = document.createElement('small')
      details.append(name, description, status)
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.action = 'perk'
      button.dataset.id = definition.id
      button.textContent = 'ELEGIR'
      row.append(details, button)
      list.append(row)
      this.perkButtons.set(definition.id, button)
      this.perkStates.set(definition.id, status)
    }
  }

  private readonly onClick = (event: MouseEvent): void => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null
    if (!button) return
    const id = button.dataset.id ?? ''
    if (button.dataset.action === 'upgrade') {
      const result = this.runState.upgrades.purchase(id)
      this.notice.textContent = result.purchased ? 'MEJORA APLICADA' : this.formatUpgradeFailure(result.reason)
    } else if (button.dataset.action === 'perk') {
      const result = this.runState.perks.select(id)
      this.notice.textContent = result.selected ? 'PERK APLICADO' : this.formatPerkFailure(result.reason)
    } else if (button.dataset.action === 'continue') {
      this.runState.endIntermission()
      this.waves.completeIntermission()
      this.notice.textContent = ''
    }
    this.update()
  }

  private readonly stopPropagation = (event: Event): void => {
    event.stopPropagation()
  }

  private formatUpgradeFailure(reason: string): string {
    const messages: Readonly<Record<string, string>> = {
      'unknown-upgrade': 'MEJORA DESCONOCIDA',
      'max-level': 'NIVEL MAXIMO',
      requirements: 'FALTAN REQUISITOS',
      'insufficient-gold': 'ORO INSUFICIENTE',
      'wrong-state': 'NO DISPONIBLE AHORA',
    }
    return messages[reason] ?? 'NO SE PUDO COMPRAR'
  }

  private formatPerkFailure(reason: string): string {
    const messages: Readonly<Record<string, string>> = {
      'unknown-perk': 'PERK DESCONOCIDO',
      'intermission-closed': 'INTERMISION CERRADA',
      'already-selected': 'PERK YA OBTENIDO',
      'max-stacks': 'MAXIMO DE STACKS',
      'choice-limit': 'YA ELEGISTE UN PERK',
    }
    return messages[reason] ?? 'NO SE PUDO ELEGIR'
  }
}