export const DEFAULT_ENEMY_DAMAGE_HITBOX_SCALE = 1.3

export type WorldObstacleKind = 'structure' | 'building' | 'porch' | 'mesa' | 'machinery'
  | 'barrel' | 'crate' | 'antenna-base' | 'generator' | 'eclipse-pylon'
  | 'rock' | 'crystal-base' | 'cactus' | 'spore-tree' | 'spore-base'

const DECORATION = Object.freeze({
  category: 'decoration', blocksMovement: false, blocksProjectiles: false,
  blocksLineOfSight: false, blocksNavigation: false,
} as const)
const STRUCTURE = Object.freeze({
  category: 'structure', blocksMovement: true, blocksProjectiles: true,
  blocksLineOfSight: true, blocksNavigation: true,
} as const)

export const WORLD_COLLISION_PROFILES = Object.freeze({
  structure: STRUCTURE, building: STRUCTURE, porch: STRUCTURE, mesa: STRUCTURE,
  machinery: STRUCTURE, barrel: STRUCTURE, crate: STRUCTURE, 'antenna-base': STRUCTURE,
  generator: STRUCTURE, 'eclipse-pylon': STRUCTURE,
  rock: DECORATION, 'crystal-base': DECORATION, cactus: DECORATION,
  'spore-tree': DECORATION, 'spore-base': DECORATION,
} satisfies Record<WorldObstacleKind, typeof DECORATION | typeof STRUCTURE>)