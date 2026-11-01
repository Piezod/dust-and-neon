import { SKILL_UNLOCK_BY_CHAPTER, SKILLS_BY_ID, type SkillCategory } from './SkillCatalog'

export interface SkillLoadout {
  readonly active: readonly string[]
  readonly passive: readonly string[]
}

export interface SkillProgressSnapshot {
  readonly unlocked: readonly string[]
  readonly loadout: SkillLoadout
}

const STORAGE_KEY = 'dust-and-neon.skills.v1'
const SLOT_COUNT = 2

export class SkillProgressStore {
  private readonly storage: Storage | null
  private readonly unlocked = new Set<string>()
  private active: string[] = ['', '']
  private passive: string[] = ['', '']

  constructor(storage: Storage | null = getStorage(), previouslyCompletedChapters: readonly string[] = []) {
    this.storage = storage
    this.load()
    this.migrateCompletedChapters(previouslyCompletedChapters)
  }

  getSnapshot(): SkillProgressSnapshot {
    return {
      unlocked: [...this.unlocked],
      loadout: { active: [...this.active], passive: [...this.passive] },
    }
  }

  isUnlocked(skillId: string): boolean {
    return this.unlocked.has(skillId)
  }

  unlockForChapter(chapterId: string): readonly string[] {
    const unlockedNow: string[] = []
    for (const id of SKILL_UNLOCK_BY_CHAPTER[chapterId] ?? []) {
      const skill = SKILLS_BY_ID.get(id)
      if (!skill || this.unlocked.has(id)) continue
      this.unlocked.add(id)
      unlockedNow.push(id)
    }
    if (unlockedNow.length > 0) this.persist()
    return unlockedNow
  }

  equip(category: SkillCategory, slot: number, skillId: string): boolean {
    if (!Number.isSafeInteger(slot) || slot < 0 || slot >= SLOT_COUNT) return false
    const skill = SKILLS_BY_ID.get(skillId)
    if (!skill || skill.category !== category || skill.implementation !== 'implemented' || !this.unlocked.has(skillId)) return false
    const target = category === 'active' ? this.active : this.passive
    if (target.includes(skillId) && target[slot] !== skillId) return false
    target[slot] = skillId
    this.persist()
    return true
  }

  unequip(category: SkillCategory, slot: number): boolean {
    if (!Number.isSafeInteger(slot) || slot < 0 || slot >= SLOT_COUNT) return false
    const target = category === 'active' ? this.active : this.passive
    if (!target[slot]) return false
    target[slot] = ''
    this.persist()
    return true
  }

  private migrateCompletedChapters(chapterIds: readonly string[]): void {
    let changed = false
    for (const chapterId of chapterIds) {
      for (const skillId of SKILL_UNLOCK_BY_CHAPTER[chapterId] ?? []) {
        if (this.unlocked.has(skillId)) continue
        this.unlocked.add(skillId)
        changed = true
      }
    }
    if (changed) this.persist()
  }

  private load(): void {
    try {
      const parsed: unknown = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? 'null')
      if (!isRecord(parsed) || parsed.version !== 1) return
      if (Array.isArray(parsed.unlocked)) {
        for (const id of parsed.unlocked) {
          const skill = typeof id === 'string' ? SKILLS_BY_ID.get(id) : undefined
          if (skill) this.unlocked.add(skill.id)
        }
      }
      this.active = normalizeSlots(parsed.active, 'active', this.unlocked)
      this.passive = normalizeSlots(parsed.passive, 'passive', this.unlocked)
    } catch {
      this.unlocked.clear()
      this.active = ['', '']
      this.passive = ['', '']
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, unlocked: [...this.unlocked], active: this.active, passive: this.passive }))
    } catch {
      // Skill progress remains available in memory if local storage is unavailable.
    }
  }
}

function normalizeSlots(value: unknown, category: SkillCategory, unlocked: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return ['', '']
  return Array.from({ length: SLOT_COUNT }, (_, index) => {
    const id = value[index]
    const skill = typeof id === 'string' ? SKILLS_BY_ID.get(id) : undefined
    return skill && skill.category === category && skill.implementation === 'implemented' && unlocked.has(skill.id) ? skill.id : ''
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getStorage(): Storage | null {
  try { return localStorage } catch { return null }
}
