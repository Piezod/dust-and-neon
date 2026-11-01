import type { CampaignDefinition } from '../game-modes/GameMode.types'
import { CAMPAIGN_CHAPTERS } from './campaignChapters.config'

export const CAMPAIGN_DEFINITION: CampaignDefinition = Object.freeze({
  id: 'dust-and-neon-campaign',
  title: 'DUST & NEON',
  chapters: Object.freeze(CAMPAIGN_CHAPTERS.map(({ id, title, missions }) => Object.freeze({ id, title, missions }))),
})