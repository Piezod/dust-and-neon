const STORAGE_KEY = 'dust-and-neon.infinite-record.v1'

export interface InfiniteRunRecord {
  readonly bestWave: number
  readonly bestScore: number
}

export class InfiniteRunRecordStore {
  private recordValue: InfiniteRunRecord = { bestWave: 0, bestScore: 0 }
  private readonly storage: Storage | null

  constructor(storage: Storage | null = this.getLocalStorage()) {
    this.storage = storage
    this.load()
  }

  get record(): InfiniteRunRecord {
    return this.recordValue
  }

  update(wave: number, score: number): InfiniteRunRecord {
    const bestWave = Math.max(this.recordValue.bestWave, Math.max(0, Math.floor(wave)))
    const bestScore = Math.max(this.recordValue.bestScore, Math.max(0, Math.floor(score)))
    this.recordValue = Object.freeze({ bestWave, bestScore })
    this.persist()
    return this.recordValue
  }

  private load(): void {
    try {
      const parsed: unknown = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? 'null')
      if (!parsed || typeof parsed !== 'object') return
      const value = parsed as { bestWave?: unknown; bestScore?: unknown }
      this.recordValue = Object.freeze({
        bestWave: typeof value.bestWave === 'number' && Number.isSafeInteger(value.bestWave) && value.bestWave >= 0 ? value.bestWave : 0,
        bestScore: typeof value.bestScore === 'number' && Number.isSafeInteger(value.bestScore) && value.bestScore >= 0 ? value.bestScore : 0,
      })
    } catch {
      this.recordValue = { bestWave: 0, bestScore: 0 }
    }
  }

  private persist(): void {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.recordValue)) } catch { /* In-memory record remains usable. */ }
  }

  private getLocalStorage(): Storage | null {
    try { return localStorage } catch { return null }
  }
}