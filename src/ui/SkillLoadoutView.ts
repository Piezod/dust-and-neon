import { SKILL_CATALOG, type SkillCategory } from '../abilities/SkillCatalog'
import type { SkillProgressStore } from '../abilities/SkillProgressStore'
import './skill-loadout.css'

export class SkillLoadoutView {
  readonly root = document.createElement('main')
  private readonly progress: SkillProgressStore
  private readonly onBack: () => void
  private readonly listeners = new AbortController()
  private readonly status: HTMLElement
  private readonly activeSlots: HTMLElement
  private readonly passiveSlots: HTMLElement
  private readonly catalog: HTMLElement

  constructor(container: HTMLElement, progress: SkillProgressStore, onBack: () => void) {
    this.progress = progress
    this.onBack = onBack
    this.root.className = 'skill-screen'
    this.root.innerHTML = `
      <div class="skill-screen__content">
        <header class="skill-screen__header">
          <button type="button" class="back-button" data-action="back">VOLVER</button>
          <span class="menu-eyebrow">LAST LIGHT OUTPOST · REGISTRO DE CAMPO</span>
          <h1>HABILIDADES</h1>
          <p>Dash basico permanece equipado. Las habilidades equipadas toman efecto en la siguiente partida.</p>
        </header>
        <div class="skill-screen__loadout">
          <section><h2>ACTIVAS · 2 RANURAS</h2><div class="skill-slot-list" data-slots="active"></div></section>
          <section><h2>PASIVAS · 2 RANURAS</h2><div class="skill-slot-list" data-slots="passive"></div></section>
        </div>
        <p class="skill-screen__status" data-value="status" role="status" aria-live="polite"></p>
        <section class="skill-screen__catalog"><h2>CATALOGO</h2><div data-value="catalog"></div></section>
      </div>
    `
    this.status = this.root.querySelector<HTMLElement>('[data-value="status"]')!
    this.activeSlots = this.root.querySelector<HTMLElement>('[data-slots="active"]')!
    this.passiveSlots = this.root.querySelector<HTMLElement>('[data-slots="passive"]')!
    this.catalog = this.root.querySelector<HTMLElement>('[data-value="catalog"]')!
    this.root.addEventListener('click', this.onClick, { signal: this.listeners.signal })
    this.root.addEventListener('change', this.onChange, { signal: this.listeners.signal })
    container.append(this.root)
    this.render()
  }

  destroy(): void {
    this.listeners.abort()
    this.root.remove()
  }

  private render(): void {
    const snapshot = this.progress.getSnapshot()
    this.renderSlots('active', this.activeSlots, snapshot.loadout.active)
    this.renderSlots('passive', this.passiveSlots, snapshot.loadout.passive)
    this.catalog.replaceChildren(...SKILL_CATALOG.map((skill) => {
      const unlocked = this.progress.isUnlocked(skill.id)
      const article = document.createElement('article')
      article.className = `skill-entry ${unlocked && skill.implementation === 'implemented' ? 'is-available' : ''}`
      const heading = document.createElement('h3')
      heading.textContent = skill.name
      const badge = document.createElement('span')
      badge.textContent = skill.implementation === 'future' ? 'PROXIMAMENTE' : unlocked ? 'DESBLOQUEADA' : `CAPITULO: ${skill.prerequisites.join(', ')}`
      const description = document.createElement('p')
      description.textContent = skill.description
      const metadata = document.createElement('small')
      metadata.textContent = skill.category === 'active' ? `ACTIVA · ${skill.energyCost} ENERGIA · ${skill.cooldownSeconds}s` : 'PASIVA'
      article.append(heading, badge, description, metadata)
      return article
    }))
  }

  private renderSlots(category: SkillCategory, root: HTMLElement, selected: readonly string[]): void {
    root.replaceChildren(...[0, 1].map((slot) => {
      const label = document.createElement('label')
      label.className = 'skill-slot'
      const title = document.createElement('span')
      title.textContent = `RANURA ${slot + 1}`
      const select = document.createElement('select')
      select.dataset.category = category
      select.dataset.slot = String(slot)
      select.setAttribute('aria-label', `${category === 'active' ? 'Activa' : 'Pasiva'} ${slot + 1}`)
      const empty = document.createElement('option')
      empty.value = ''
      empty.textContent = 'Sin equipar'
      select.append(empty)
      for (const skill of SKILL_CATALOG) {
        if (skill.category !== category || skill.implementation !== 'implemented' || !this.progress.isUnlocked(skill.id)) continue
        const option = document.createElement('option')
        option.value = skill.id
        option.textContent = skill.name
        select.append(option)
      }
      select.value = selected[slot] ?? ''
      label.append(title, select)
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'skill-slot__remove'
      remove.dataset.action = 'unequip'
      remove.dataset.category = category
      remove.dataset.slot = String(slot)
      remove.textContent = 'QUITAR'
      remove.disabled = !select.value
      label.append(remove)
      return label
    }))
  }

  private readonly onChange = (event: Event): void => {
    const select = event.target
    if (!(select instanceof HTMLSelectElement)) return
    const category = select.dataset.category as SkillCategory | undefined
    const slot = Number(select.dataset.slot)
    if (!category || !Number.isSafeInteger(slot)) return
    const selected = this.progress.getSnapshot().loadout[category][slot]
    const changed = select.value
      ? this.progress.equip(category, slot, select.value)
      : this.progress.unequip(category, slot)
    this.status.textContent = changed
      ? 'Equipamiento guardado. Se aplicara al iniciar la siguiente partida.'
      : selected === select.value ? '' : 'Habilidad bloqueada o incompatible con esta ranura.'
    this.render()
  }

  private readonly onClick = (event: MouseEvent): void => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null
    if (!button) return
    if (button.dataset.action === 'back') this.onBack()
    else if (button.dataset.action === 'unequip') {
      const category = button.dataset.category as SkillCategory | undefined
      const slot = Number(button.dataset.slot)
      if (category && Number.isSafeInteger(slot)) {
        this.progress.unequip(category, slot)
        this.status.textContent = 'Ranura vacia.'
        this.render()
      }
    }
  }
}
