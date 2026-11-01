export type GameMode = 'campaign' | 'infinite'

export interface CampaignMissionDefinition {
  readonly id: string
  readonly title: string
  readonly provisional: boolean
}

export interface CampaignChapterDefinition {
  readonly id: string
  readonly title: string
  readonly missions: readonly CampaignMissionDefinition[]
}

export interface CampaignDefinition {
  readonly id: string
  readonly title: string
  readonly chapters: readonly CampaignChapterDefinition[]
}