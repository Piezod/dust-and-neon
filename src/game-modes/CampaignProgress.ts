import type { CampaignDefinition } from './GameMode.types'

const STORAGE_KEY = 'dust-and-neon.campaign.v1'

export class CampaignProgress {
  private readonly missions: readonly string[]
  private readonly completed = new Set<string>()
  private readonly unlocked = new Set<string>()
  private readonly storage: Storage | null

  constructor(definition: CampaignDefinition, storage: Storage | null = this.getLocalStorage()) {
    this.storage = storage
    this.missions = definition.chapters.flatMap((chapter) => chapter.missions.map((mission) => mission.id))
    this.unlocked.add(this.missions[0] ?? '')
    this.load()
  }

  isUnlocked(missionId: string): boolean {
    return this.unlocked.has(missionId)
  }

  isCompleted(missionId: string): boolean {
    return this.completed.has(missionId)
  }

  completeMission(missionId: string): boolean {
    if (!this.unlocked.has(missionId) || !this.missions.includes(missionId)) return false
    this.completed.add(missionId)
    const index = this.missions.indexOf(missionId)
    const next = this.missions[index + 1]
    if (next) this.unlocked.add(next)
    this.persist()
    return true
  }

  reset(): void {
    this.completed.clear()
    this.unlocked.clear()
    if (this.missions[0]) this.unlocked.add(this.missions[0])
    this.persist()
  }

  private load(): void {
    try {
      const parsed: unknown = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? 'null')
      if (!parsed || typeof parsed !== 'object') return
      const record = parsed as { completed?: unknown; unlocked?: unknown }
      if (Array.isArray(record.completed)) {
        for (const id of record.completed) if (typeof id === 'string' && this.missions.includes(id)) this.completed.add(id)
      }
      if (Array.isArray(record.unlocked)) {
        for (const id of record.unlocked) if (typeof id === 'string' && this.missions.includes(id)) this.unlocked.add(id)
      }
      if (this.missions[0]) this.unlocked.add(this.missions[0])
      for (const completedId of this.completed) {
        const next = this.missions[this.missions.indexOf(completedId) + 1]
        if (next) this.unlocked.add(next)
      }
    } catch {
      this.reset()
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ completed: [...this.completed], unlocked: [...this.unlocked] }))
    } catch {
      // Campaign progress remains available in memory when storage is disabled.
    }
  }

  private getLocalStorage(): Storage | null {
    try { return localStorage } catch { return null }
  }
}