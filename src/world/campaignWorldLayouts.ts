import type { WorldScenarioId } from './World'

export interface CampaignWorldFeature {
  readonly id: string
  readonly kind: 'walkway' | 'spore-tree' | 'spore-cluster' | 'storm-antenna' | 'storm-generator' | 'eclipse-pylon' | 'eclipse-ring'
  readonly position: readonly [number, number, number]
  readonly size: readonly [number, number, number]
  readonly color: string
}

export interface CampaignWorldLayout {
  readonly groundColor: string
  readonly roadColor: string
  readonly outerLandmarks: readonly { readonly x: number; readonly z: number; readonly size: number }[]
  readonly features: readonly CampaignWorldFeature[]
}

export const CAMPAIGN_WORLD_LAYOUTS: Readonly<Record<Extract<WorldScenarioId, 'spore-swamp' | 'storm-observatory' | 'eclipse-core'>, CampaignWorldLayout>> = Object.freeze({
  'spore-swamp': {
    groundColor: '#526451',
    roadColor: '#66764e',
    outerLandmarks: [],
    features: [
      { id: 'raised-crossing-west', kind: 'walkway', position: [-7, 0.18, 0], size: [10, 0.34, 2.1], color: '#765b43' },
      { id: 'raised-crossing-east', kind: 'walkway', position: [6, 0.18, 4], size: [9, 0.34, 2.1], color: '#806146' },
      { id: 'spore-canopy-north', kind: 'spore-tree', position: [-14, 0, -11], size: [1.4, 5.2, 1.4], color: '#69dfb0' },
      { id: 'spore-canopy-south', kind: 'spore-tree', position: [14, 0, -12], size: [1.2, 4.7, 1.2], color: '#77d896' },
      { id: 'spore-cluster-west', kind: 'spore-cluster', position: [-15, 0, 8], size: [1.5, 2.5, 1.5], color: '#90f0c2' },
      { id: 'spore-cluster-east', kind: 'spore-cluster', position: [15, 0, 9], size: [1.6, 2.7, 1.6], color: '#7de7d0' },
      { id: 'spore-cluster-depth', kind: 'spore-cluster', position: [0, 0, -20], size: [1.8, 3.1, 1.8], color: '#b0e88f' },
    ],
  },
  'storm-observatory': {
    groundColor: '#626166',
    roadColor: '#737c7c',
    outerLandmarks: [
      { x: -47, z: 0, size: 7 }, { x: 47, z: 0, size: 7 }, { x: 0, z: -48, size: 6 }, { x: 0, z: 48, size: 6 },
    ],
    features: [
      { id: 'north-antenna', kind: 'storm-antenna', position: [-13, 0, -12], size: [1.2, 8, 1.2], color: '#65ddeb' },
      { id: 'east-antenna', kind: 'storm-antenna', position: [14, 0, 10], size: [1.1, 7, 1.1], color: '#85e9e9' },
      { id: 'west-generator', kind: 'storm-generator', position: [-14, 0, 12], size: [2.4, 2.8, 2.1], color: '#e49d5a' },
      { id: 'east-generator', kind: 'storm-generator', position: [13, 0, -11], size: [2.2, 2.6, 2], color: '#68a9bd' },
      { id: 'north-catwalk', kind: 'walkway', position: [0, 0.16, -18], size: [13, 0.3, 1.8], color: '#747979' },
      { id: 'south-catwalk', kind: 'walkway', position: [0, 0.16, 18], size: [13, 0.3, 1.8], color: '#747979' },
    ],
  },
  'eclipse-core': {
    groundColor: '#494258',
    roadColor: '#645574',
    outerLandmarks: [
      { x: -49, z: -25, size: 7 }, { x: 48, z: -24, size: 7 }, { x: -48, z: 26, size: 7 }, { x: 49, z: 25, size: 7 },
    ],
    features: [
      { id: 'north-eclipse-pylon', kind: 'eclipse-pylon', position: [0, 0, -18], size: [1.5, 6, 1.5], color: '#a47be0' },
      { id: 'south-eclipse-pylon', kind: 'eclipse-pylon', position: [0, 0, 18], size: [1.5, 6, 1.5], color: '#d174c7' },
      { id: 'west-eclipse-pylon', kind: 'eclipse-pylon', position: [-18, 0, 0], size: [1.5, 5.5, 1.5], color: '#6f83dc' },
      { id: 'east-eclipse-pylon', kind: 'eclipse-pylon', position: [18, 0, 0], size: [1.5, 5.5, 1.5], color: '#d8915b' },
      { id: 'outer-energy-ring', kind: 'eclipse-ring', position: [0, 0.05, 0], size: [12, 0.12, 12], color: '#a74ee8' },
      { id: 'inner-energy-ring', kind: 'eclipse-ring', position: [0, 0.06, 0], size: [7.2, 0.1, 7.2], color: '#43e0c3' },
    ],
  },
})
