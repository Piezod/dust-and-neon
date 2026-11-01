import type { GameEvent, GameEventBus } from '../events/GameEventBus'

const STORAGE_KEY = 'dust-and-neon.achievements.v1'

export interface AchievementDefinition {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly event: GameEvent['type']
  readonly target: number
}

export interface AchievementState {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly progress: number
  readonly target: number
  readonly unlocked: boolean
}

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = Object.freeze([
  Object.freeze({ id: 'first-kill', title: 'Primera baja', description: 'Elimina tu primer enemigo.', event: 'enemy-killed', target: 1 }),
  Object.freeze({ id: 'first-wave', title: 'Resiste', description: 'Completa tu primera oleada.', event: 'wave-completed', target: 1 }),
  Object.freeze({ id: 'ten-kills', title: 'Limpieza de sector', description: 'Elimina diez enemigos.', event: 'enemy-killed', target: 10 }),
  Object.freeze({ id: 'first-perk', title: 'Mutacion util', description: 'Selecciona tu primer perk.', event: 'perk-selected', target: 1 }),
  Object.freeze({ id: 'first-upgrade', title: 'Piezas nuevas', description: 'Compra tu primera mejora.', event: 'upgrade-purchased', target: 1 }),
  Object.freeze({ id: 'five-waves', title: 'Cinco rondas', description: 'Completa cinco oleadas.', event: 'wave-completed', target: 5 }),
])

type StoredProgress = { readonly unlocked: readonly string[]; readonly counters: Readonly<Record<string, number>> }
export type AchievementListener = (achievement: AchievementState) => void

export class AchievementManager {
  private readonly definitions: ReadonlyMap<string, AchievementDefinition>
  private readonly unlocked = new Set<string>()
  private readonly counters = new Map<string, number>()
  private readonly listeners = new Set<AchievementListener>()
  private readonly unsubscribeEvent: () => void
  private readonly storage: Storage | null

  constructor(events: GameEventBus, definitions: readonly AchievementDefinition[] = ACHIEVEMENT_DEFINITIONS, storage: Storage | null = this.getLocalStorage()) {
    this.storage = storage
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]))
    if (this.definitions.size !== definitions.length) throw new Error('Achievement IDs must be unique')
    this.load()
    this.unsubscribeEvent = events.subscribe((event) => this.onEvent(event))
  }

  getStates(): readonly AchievementState[] {
    return Array.from(this.definitions.values(), (definition) => ({
      id: definition.id,
      title: definition.title,
      description: definition.description,
      progress: Math.min(definition.target, this.counters.get(definition.event) ?? 0),
      target: definition.target,
      unlocked: this.unlocked.has(definition.id),
    }))
  }

  subscribe(listener: AchievementListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.unsubscribeEvent()
    this.listeners.clear()
  }

  private onEvent(event: GameEvent): void {
    const affected = Array.from(this.definitions.values()).filter((definition) => definition.event === event.type)
    if (affected.length === 0) return
    const progress = (this.counters.get(event.type) ?? 0) + 1
    this.counters.set(event.type, progress)
    for (const definition of affected) {
      if (progress < definition.target || this.unlocked.has(definition.id)) continue
      this.unlocked.add(definition.id)
      const state = this.getStates().find((entry) => entry.id === definition.id)!
      for (const listener of this.listeners) listener(state)
    }
    this.persist()
  }

  private load(): void {
    try {
      const parsed: unknown = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? 'null')
      if (!parsed || typeof parsed !== 'object') return
      const value = parsed as Partial<StoredProgress>
      if (Array.isArray(value.unlocked)) {
        for (const id of value.unlocked) if (typeof id === 'string' && this.definitions.has(id)) this.unlocked.add(id)
      }
      if (value.counters && typeof value.counters === 'object') {
        for (const [event, count] of Object.entries(value.counters)) {
          if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) this.counters.set(event, count)
        }
      }
    } catch {
      this.unlocked.clear()
      this.counters.clear()
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ unlocked: [...this.unlocked], counters: Object.fromEntries(this.counters) }))
    } catch {
      // Achievements remain available in memory when storage is disabled.
    }
  }

  private getLocalStorage(): Storage | null {
    try { return localStorage } catch { return null }
  }
}