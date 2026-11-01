import type { CampaignChapterDefinition } from './GameMode.types'
import type { WaveDefinition } from '../waves/Wave.types'
import type { WorldScenarioId } from '../world/World'

export interface CampaignChapterContent extends CampaignChapterDefinition {
  readonly intro: string
  readonly worldScenario: WorldScenarioId
  readonly bossId: string
  readonly waves: readonly WaveDefinition[]
  readonly bossPosition: readonly [number, number, number]
}
