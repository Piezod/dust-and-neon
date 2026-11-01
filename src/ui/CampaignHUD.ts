import type { CampaignSnapshot } from '../game-modes/CampaignManager'
import './campaign-hud.css'

export class CampaignHUD {
  private readonly root = document.createElement('section')
  private readonly chapter = document.createElement('div')
  private readonly boss = document.createElement('div')
  private readonly title = document.createElement('strong')
  private readonly copy = document.createElement('span')
  private readonly bossName = document.createElement('strong')
  private readonly bossPhase = document.createElement('span')
  private readonly bossHealth = document.createElement('div')
  private readonly bossFill = document.createElement('span')
  private lastBanner = ''

  constructor(container: HTMLElement) {
    this.root.className = 'campaign-hud'
    this.chapter.className = 'campaign-hud__chapter'
    this.chapter.setAttribute('aria-live', 'polite')
    this.title.className = 'campaign-hud__title'
    this.copy.className = 'campaign-hud__copy'
    this.chapter.append(this.title, this.copy)
    this.boss.className = 'campaign-hud__boss'
    this.bossName.className = 'campaign-hud__boss-name'
    this.bossPhase.className = 'campaign-hud__boss-phase'
    this.bossHealth.className = 'campaign-hud__boss-health'
    this.bossHealth.setAttribute('role', 'progressbar')
    this.bossHealth.setAttribute('aria-label', 'Vida del jefe')
    this.bossHealth.setAttribute('aria-valuemin', '0')
    this.bossHealth.setAttribute('aria-valuemax', '100')
    this.bossHealth.append(this.bossFill)
    this.boss.append(this.bossName, this.bossPhase, this.bossHealth)
    this.root.append(this.chapter, this.boss)
    container.append(this.root)
  }

  update(snapshot: CampaignSnapshot): void {
    const chapterNumber = `${String(snapshot.chapterIndex + 1).padStart(2, '0')} / ${String(snapshot.chapterCount).padStart(2, '0')}`
    let banner = ''
    if (snapshot.state === 'chapter-intro') banner = `${chapterNumber}|${snapshot.chapterTitle}|${snapshot.intro}`
    else if (snapshot.state === 'boss-intro' && snapshot.boss) banner = `BOSS|${snapshot.boss.name}|ELIMINA AL OBJETIVO`
    else if (snapshot.state === 'chapter-complete') banner = `CAPITULO COMPLETADO|${snapshot.chapterTitle}|La ruta continua...`
    if (banner !== this.lastBanner) {
      this.lastBanner = banner
      this.title.textContent = banner ? banner.split('|')[1] : ''
      this.copy.textContent = banner ? banner.split('|')[2] : ''
      this.chapter.dataset.chapter = banner ? banner.split('|')[0] : ''
      this.chapter.hidden = !banner
    }
    const boss = snapshot.boss
    const visible = Boolean(boss && boss.state !== 'defeated' && boss.state !== 'disposed')
    this.boss.hidden = !visible
    if (!boss || !visible) return
    this.bossName.textContent = boss.name
    this.bossPhase.textContent = `FASE ${boss.phaseIndex + 1} / ${boss.phaseCount}  ·  ${boss.phaseId.replaceAll('-', ' ').toUpperCase()}`
    const ratio = Math.max(0, Math.min(1, boss.healthRatio))
    this.bossFill.style.transform = `scaleX(${ratio})`
    this.bossHealth.setAttribute('aria-valuenow', String(Math.round(ratio * 100)))
  }

  destroy(): void {
    this.root.remove()
  }
}
