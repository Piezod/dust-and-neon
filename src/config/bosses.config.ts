import type { DamageStatusApplication, DamageType, ProjectileDefinition } from '../combat/Combat.types'
import type { BossAttackDefinition, BossDefinition, BossPhaseDefinition, BossVisualPart } from '../bosses/Boss.types'

const phase = (id: string, healthBelow: number, attackIds: readonly string[], moveSpeedMultiplier: number, visualTint: string, enterSoundId: string): BossPhaseDefinition => ({
  id, healthBelow, attackIds, moveSpeedMultiplier, visualTint, enterSoundId,
})

const part = (id: string, shape: BossVisualPart['shape'], position: readonly [number, number, number], size: readonly [number, number, number], color: string, emissive = '#000000'): BossVisualPart => ({
  id, shape, position, size, color, emissive, emissiveIntensity: emissive === '#000000' ? 0 : 1.1,
})

const projectile = (id: string, damage: number, speed: number, color: string, damageType: DamageType = 'physical', onImpact?: ProjectileDefinition['onImpact'], statusEffects?: readonly DamageStatusApplication[]) => ({
  id, damage, projectileSpeed: speed, maxRange: 30, projectileRadius: 0.18, damageType,
  projectileColor: color, projectileEmissive: color, projectileEmissiveIntensity: 1.4,
  ...(onImpact ? { onImpact } : {}), ...(statusEffects ? { statusEffects } : {}),
})

const attack = (id: string, pattern: BossAttackDefinition['pattern'], phases: readonly string[], options: Partial<BossAttackDefinition> = {}): BossAttackDefinition => ({
  id, pattern, phases, minRange: 0, maxRange: 32, priority: 1, weight: 1, cooldownSeconds: 2.4,
  windupSeconds: 0.8, activeSeconds: 0.3, recoverySeconds: 0.65, damage: 12, damageType: 'physical',
  telegraph: 'line', ...options,
})

const sheriffPhases = [
  phase('duel', 1, ['revolver', 'crossfire', 'lariat'], 1, '#ffffff', 'boss-sheriff-phase-1'),
  phase('wanted', 0.66, ['revolver', 'crossfire', 'lariat', 'ricochet'], 1.18, '#ffb24d', 'boss-sheriff-phase-2'),
  phase('last-stand', 0.32, ['crossfire', 'ricochet', 'stampede'], 1.38, '#ff5e52', 'boss-sheriff-phase-3'),
]

const matriarchPhases = [
  phase('brood-queen', 1, ['spit', 'crystal-fan', 'brood'], 0.9, '#ffffff', 'boss-matriarch-phase-1'),
  phase('shatter', 0.68, ['spit', 'crystal-fan', 'brood', 'spines'], 1.08, '#70efff', 'boss-matriarch-phase-2'),
  phase('deep-awakening', 0.34, ['crystal-fan', 'spines', 'collapse'], 1.28, '#d95aff', 'boss-matriarch-phase-3'),
]

const preacherPhases = [
  phase('sermon', 1, ['edict', 'brand', 'procession'], 0.88, '#ffffff', 'boss-preacher-phase-1'),
  phase('fire-and-brimstone', 0.7, ['edict', 'brand', 'procession', 'purgatory'], 1.12, '#ff9854', 'boss-preacher-phase-2'),
  phase('apocalypse', 0.35, ['brand', 'purgatory', 'final-word'], 1.32, '#ff4545', 'boss-preacher-phase-3'),
]

const mudMatriarchPhases = [
  phase('silt', 1, ['mud-fan', 'marsh-slam', 'root-lash'], 0.9, '#ffffff', 'boss-mud-phase-1'),
  phase('spore-bloom', 0.68, ['mud-fan', 'marsh-slam', 'root-lash', 'spore-brood'], 1.05, '#84d28b', 'boss-mud-phase-2'),
  phase('floodline', 0.34, ['mud-fan', 'marsh-slam', 'root-lash', 'spore-brood'], 1.24, '#6ee6be', 'boss-mud-phase-3'),
]

const stormMarshalPhases = [
  phase('charge', 1, ['storm-lance', 'coil-link'], 0.94, '#ffffff', 'boss-storm-phase-1'),
  phase('overload', 0.68, ['storm-lance', 'coil-link', 'forked-bolt'], 1.08, '#64dbea', 'boss-storm-phase-2'),
  phase('eye-of-storm', 0.34, ['coil-link', 'forked-bolt', 'ground-surge'], 1.24, '#a7f3ff', 'boss-storm-phase-3'),
]

const eclipseSmelterPhases = [
  phase('plasma-heart', 1, ['eclipse-orb', 'eclipse-front'], 0.9, '#ffffff', 'boss-eclipse-phase-1'),
  phase('thermal-inversion', 0.68, ['eclipse-orb', 'ember-fan', 'frost-fan'], 1.05, '#f0805d', 'boss-eclipse-phase-2'),
  phase('dark-fusion', 0.34, ['eclipse-sequence', 'eclipse-orb'], 1.24, '#b88cf2', 'boss-eclipse-phase-3'),
]

export const BOSS_DEFINITIONS: readonly BossDefinition[] = Object.freeze([
  {
    id: 'iron-sheriff', name: 'EL SHERIFF DE HIERRO', subtitle: 'El ultimo alguacil de Pueblo Fantasma', maxHealth: 1250,
    collisionRadius: 1.15, moveSpeed: 2.1, preferredDistance: 4.4, movement: 'orbit', detectionRange: 26, arenaRadius: 16, arenaColor: '#42e5d1', maxSummons: 4,
    phases: sheriffPhases,
    attacks: [
      attack('revolver', 'aimed', ['duel', 'wanted'], { projectile: projectile('sheriff-round', 15, 20, '#ffc35c'), cooldownSeconds: 1.8, windupSeconds: 0.55, damage: 15 }),
      attack('crossfire', 'burst', ['duel', 'wanted', 'last-stand'], { projectile: projectile('sheriff-burst', 11, 17, '#ff9c45'), projectileCount: 1, burstCount: 4, burstIntervalSeconds: 0.2, cooldownSeconds: 4.2, windupSeconds: 0.75, activeSeconds: 0.7, damage: 11 }),
      attack('lariat', 'melee', ['duel', 'wanted'], { minRange: 0, maxRange: 5.6, radius: 4.6, cooldownSeconds: 3.6, windupSeconds: 0.9, damage: 24, telegraph: 'ring' }),
      attack('ricochet', 'fan', ['wanted', 'last-stand'], { projectile: projectile('sheriff-ricochet', 12, 16, '#ffd56a'), projectileCount: 5, spreadRadians: 0.9, cooldownSeconds: 3, damage: 12, telegraph: 'fan' }),
      attack('stampede', 'charge', ['last-stand'], { maxRange: 15, chargeSpeed: 8.5, activeSeconds: 1.2, cooldownSeconds: 4, windupSeconds: 1, damage: 30, radius: 0.8, telegraph: 'line' }),
    ],
    visualParts: [
      part('body', 'box', [0, 1.5, 0], [1.35, 1.6, 0.9], '#55413d'), part('coat', 'box', [0, 1.15, 0], [1.8, 1.6, 1.05], '#7a382e'),
      part('head', 'sphere', [0, 2.55, 0], [0.8, 0.85, 0.8], '#b98b65'), part('hat', 'cylinder', [0, 3.02, 0], [1.15, 0.25, 1.05], '#282b30'),
      part('badge', 'sphere', [0.52, 1.9, 0.49], [0.27, 0.27, 0.1], '#f4c05b', '#f4c05b'),
    ],
    rewards: { gold: 180, healthRecovery: 35, energyRecovery: 40 },
  },
  {
    id: 'abyss-matriarch', name: 'LA MATRIARCA DEL ABISMO', subtitle: 'La reina bajo el Cañon de Cristal', maxHealth: 1650,
    collisionRadius: 1.65, moveSpeed: 1.7, preferredDistance: 10, movement: 'hold', detectionRange: 28, arenaRadius: 17, arenaColor: '#d95aff', maxSummons: 5,
    phases: matriarchPhases,
    attacks: [
      attack('spit', 'aimed', ['brood-queen', 'shatter'], { projectile: projectile('abyss-spit', 17, 15, '#70efff'), cooldownSeconds: 2.4, windupSeconds: 0.9, damage: 17 }),
      attack('crystal-fan', 'fan', ['brood-queen', 'shatter', 'deep-awakening'], { projectile: projectile('matriarch-shard', 13, 17, '#9bf5ff'), projectileCount: 7, spreadRadians: 1.2, cooldownSeconds: 3.5, damage: 13, telegraph: 'fan' }),
      attack('brood', 'summon', ['brood-queen', 'shatter'], { summonEnemyId: 'alien-crawler', summonCount: 2, cooldownSeconds: 8, windupSeconds: 1.3, activeSeconds: 0.1, damage: 0, telegraph: 'ring' }),
      attack('spines', 'radial', ['shatter', 'deep-awakening'], { projectile: projectile('abyss-spine', 12, 13, '#d95aff'), projectileCount: 12, cooldownSeconds: 4, windupSeconds: 1.1, damage: 12, telegraph: 'ring' }),
      attack('collapse', 'zone', ['deep-awakening'], { radius: 5.2, maxRange: 26, cooldownSeconds: 4.6, windupSeconds: 1.5, activeSeconds: 0.1, damage: 32, telegraph: 'zone' }),
    ],
    visualParts: [
      part('core', 'sphere', [0, 2.1, 0], [1.4, 1.65, 1.3], '#4a236c', '#9c4bd2'),
      part('carapace', 'sphere', [0, 2.4, -0.15], [2.4, 1.35, 1.7], '#276775', '#38d6e8'),
      part('crown', 'cone', [0, 3.6, 0], [1.6, 1.5, 1.4], '#9b5bce', '#d95aff'),
      part('left-claw', 'cone', [-1.25, 1.7, 0.05], [0.65, 1.8, 0.65], '#50c7d7'),
      part('right-claw', 'cone', [1.25, 1.7, 0.05], [0.65, 1.8, 0.65], '#50c7d7'),
    ],
    rewards: { gold: 240, healthRecovery: 45, energyRecovery: 45 },
  },
  {
    id: 'crimson-preacher', name: 'EL PREDICADOR CARMESI', subtitle: 'La voz que despierta la Fundicion Roja', maxHealth: 1900,
    collisionRadius: 1.25, moveSpeed: 2.2, preferredDistance: 9, movement: 'orbit', detectionRange: 30, arenaRadius: 17, arenaColor: '#f05a46', maxSummons: 5,
    phases: preacherPhases,
    attacks: [
      attack('edict', 'aimed', ['sermon', 'fire-and-brimstone'], { projectile: projectile('preacher-edict', 18, 19, '#ffcc66'), cooldownSeconds: 2, windupSeconds: 0.65, damage: 18 }),
      attack('brand', 'laser', ['sermon', 'fire-and-brimstone', 'apocalypse'], { radius: 0.9, maxRange: 27, cooldownSeconds: 4, windupSeconds: 1.2, activeSeconds: 0.5, damage: 30, telegraph: 'line' }),
      attack('procession', 'summon', ['sermon', 'fire-and-brimstone'], { summonEnemyId: 'mechanical-outlaw', summonCount: 2, cooldownSeconds: 9, windupSeconds: 1.4, activeSeconds: 0.1, damage: 0, telegraph: 'ring' }),
      attack('purgatory', 'radial', ['fire-and-brimstone', 'apocalypse'], { projectile: projectile('preacher-cinder', 14, 14, '#ff614b'), projectileCount: 14, cooldownSeconds: 4.2, windupSeconds: 1, damage: 14, telegraph: 'ring' }),
      attack('final-word', 'sequence', ['apocalypse'], { projectile: projectile('preacher-word', 16, 16, '#ff4545'), cooldownSeconds: 5, windupSeconds: 1.4, activeSeconds: 1.1, damage: 16, telegraph: 'fan', sequence: [
        { pattern: 'fan', delaySeconds: 0.2, projectileCount: 5, spreadRadians: 0.6 },
        { pattern: 'radial', delaySeconds: 0.7, projectileCount: 10 },
      ] }),
    ],
    visualParts: [
      part('robe', 'cone', [0, 1.6, 0], [1.65, 2.7, 1.5], '#6b2529', '#a33231'),
      part('torso', 'box', [0, 2.15, 0], [1.2, 1.55, 0.85], '#8f3031'),
      part('mask', 'sphere', [0, 2.75, 0.15], [0.8, 1, 0.75], '#e0b07a', '#ff694d'),
      part('halo', 'torus', [0, 3.5, 0], [0.8, 0.8, 0.1], '#ff6a44', '#ff3c2f'),
      part('staff', 'cylinder', [1.05, 2.05, 0], [0.12, 2.8, 0.12], '#3c3332'),
      part('flame', 'cone', [1.05, 3.55, 0], [0.48, 0.8, 0.48], '#ff8b43', '#ff3c2f'),
    ],
    rewards: { gold: 320, healthRecovery: 60, energyRecovery: 60 },
  },
  {
    id: 'mud-matriarch', name: 'LA MATRIARCA DEL FANGO', subtitle: 'La guardiana de las pasarelas del pantano', maxHealth: 2100,
    collisionRadius: 1.55, moveSpeed: 1.65, preferredDistance: 8, movement: 'hold', detectionRange: 30, arenaRadius: 18, arenaColor: '#77dfa8', maxSummons: 3,
    phases: mudMatriarchPhases,
    attacks: [
      attack('mud-fan', 'fan', ['silt', 'spore-bloom', 'floodline'], { projectile: projectile('boss.mud-shard', 12, 13, '#77dfa8'), projectileCount: 6, spreadRadians: 0.9, cooldownSeconds: 3.2, windupSeconds: 0.9, damage: 12, telegraph: 'fan' }),
      attack('marsh-slam', 'zone', ['silt', 'spore-bloom', 'floodline'], { radius: 3.2, maxRange: 21, cooldownSeconds: 4.2, windupSeconds: 1, activeSeconds: 0.1, recoverySeconds: 1.1, damage: 29, telegraph: 'zone' }),
      attack('root-lash', 'melee', ['silt', 'spore-bloom', 'floodline'], { radius: 3.6, maxRange: 4.2, cooldownSeconds: 3.6, windupSeconds: 0.85, recoverySeconds: 1, damage: 25, telegraph: 'line' }),
      attack('spore-brood', 'summon', ['spore-bloom', 'floodline'], { summonEnemyId: 'alien-crawler', summonCount: 2, cooldownSeconds: 9, windupSeconds: 1.2, damage: 0, telegraph: 'ring' }),
    ],
    visualParts: [
      part('mud-core', 'sphere', [0, 2, 0], [1.35, 1.15, 1.25], '#566247', '#6fa667'),
      part('shell', 'cylinder', [0, 2.45, -0.15], [1.8, 0.7, 1.8], '#596f55', '#77dfa8'),
      part('mask', 'sphere', [0, 2.35, 0.8], [0.7, 0.55, 0.55], '#8f7658', '#b8e889'),
      part('left-claw', 'cone', [-1.4, 1.3, 0.35], [0.55, 1.7, 0.55], '#7a7650'),
      part('right-claw', 'cone', [1.4, 1.3, 0.35], [0.55, 1.7, 0.55], '#7a7650'),
      part('spore-lantern', 'sphere', [0, 3.35, -0.15], [0.4, 0.55, 0.4], '#91f0bd', '#69e0a0'),
    ],
    rewards: { gold: 360, healthRecovery: 55, energyRecovery: 55 },
  },
  {
    id: 'storm-marshal', name: 'EL ALGUACIL DE LA TORMENTA', subtitle: 'El ultimo vigia del observatorio', maxHealth: 2350,
    collisionRadius: 1.2, moveSpeed: 2, preferredDistance: 10, movement: 'orbit', detectionRange: 32, arenaRadius: 18, arenaColor: '#54dcec', maxSummons: 3,
    phases: stormMarshalPhases,
    attacks: [
      attack('storm-lance', 'laser', ['charge', 'overload'], { radius: 0.72, maxRange: 28, cooldownSeconds: 3.8, windupSeconds: 1.1, activeSeconds: 0.2, recoverySeconds: 1.2, damage: 31, damageType: 'electric', telegraph: 'line', statusEffects: [{ type: 'shock', staggerSeconds: 0.16 }] }),
      attack('coil-link', 'arc-nodes', ['charge', 'overload', 'eye-of-storm'], { nodeRange: 12, linkWidth: 0.46, nodeHealth: 28, tickIntervalSeconds: 0.48, cooldownSeconds: 7.5, windupSeconds: 1.05, activeSeconds: 0.3, recoverySeconds: 1, damage: 15, damageType: 'electric', telegraph: 'nodes', statusEffects: [{ type: 'shock', staggerSeconds: 0.12 }] }),
      attack('forked-bolt', 'radial', ['overload', 'eye-of-storm'], { projectile: projectile('boss.storm-bolt', 12, 14, '#6be7ff', 'electric', undefined, [{ type: 'shock', staggerSeconds: 0.1 }]), projectileCount: 12, cooldownSeconds: 4.4, windupSeconds: 1.05, activeSeconds: 0.2, recoverySeconds: 1.25, damage: 12, damageType: 'electric', telegraph: 'ring' }),
      attack('ground-surge', 'zone', ['eye-of-storm'], { radius: 4.2, maxRange: 26, cooldownSeconds: 4.8, windupSeconds: 1.35, activeSeconds: 0.1, recoverySeconds: 1.5, damage: 34, damageType: 'electric', telegraph: 'zone' }),
    ],
    visualParts: [
      part('armor', 'box', [0, 1.55, 0], [1.4, 1.8, 0.95], '#3c5664', '#348aa1'),
      part('coat', 'cone', [0, 0.9, 0], [1.25, 1.8, 1.1], '#405662'),
      part('mask', 'sphere', [0, 2.65, 0.05], [0.72, 0.8, 0.7], '#9cb2ab', '#63e5f4'),
      part('antenna', 'cylinder', [0, 3.55, -0.1], [0.1, 1.1, 0.1], '#bfaa75'),
      part('coil', 'torus', [0, 2, -0.58], [0.63, 0.11, 0.63], '#50d9ee', '#47dfff'),
      part('right-baton', 'cylinder', [0.94, 1.75, 0.15], [0.14, 1.9, 0.14], '#657b81', '#4ccfe7'),
    ],
    rewards: { gold: 420, healthRecovery: 60, energyRecovery: 62 },
  },
  {
    id: 'eclipse-smelter', name: 'EL FUNDIDOR DEL ECLIPSE', subtitle: 'El nucleo viviente del complejo alienigena', maxHealth: 2800,
    collisionRadius: 1.45, moveSpeed: 1.8, preferredDistance: 9, movement: 'hold', detectionRange: 32, arenaRadius: 20, arenaColor: '#c38cff', maxSummons: 0,
    phases: eclipseSmelterPhases,
    attacks: [
      attack('eclipse-orb', 'aimed', ['plasma-heart', 'thermal-inversion'], { projectile: projectile('boss.eclipse-orb', 25, 13, '#d6a5ff', 'plasma', { splash: { radius: 2.8, damageMultiplier: 0.65, maxTargets: 6 } }), cooldownSeconds: 3.4, windupSeconds: 1, activeSeconds: 0.2, recoverySeconds: 1.15, damage: 25, damageType: 'plasma', telegraph: 'zone' }),
      attack('eclipse-front', 'melee', ['plasma-heart'], { radius: 3.2, minRange: 0, maxRange: 3.8, cooldownSeconds: 3.6, windupSeconds: 0.9, recoverySeconds: 1.1, damage: 32, damageType: 'plasma', telegraph: 'ring' }),
      attack('ember-fan', 'fan', ['thermal-inversion'], { projectile: projectile('boss.eclipse-ember', 13, 14, '#ff805b', 'fire', undefined, [{ type: 'burn', durationSeconds: 1.4, damagePerSecond: 3, tickIntervalSeconds: 0.5 }]), projectileCount: 5, spreadRadians: 0.82, cooldownSeconds: 3.2, windupSeconds: 0.9, activeSeconds: 0.2, recoverySeconds: 1.1, damage: 13, damageType: 'fire', telegraph: 'fan' }),
      attack('frost-fan', 'fan', ['thermal-inversion'], { projectile: projectile('boss.eclipse-frost', 13, 13, '#8de8ff', 'cryo', undefined, [{ type: 'slow', durationSeconds: 1.2, movementMultiplier: 0.72 }]), projectileCount: 5, spreadRadians: 0.82, cooldownSeconds: 3.2, windupSeconds: 1, activeSeconds: 0.2, recoverySeconds: 1.1, damage: 13, damageType: 'cryo', telegraph: 'fan' }),
      attack('eclipse-sequence', 'sequence', ['dark-fusion'], { projectile: projectile('boss.eclipse-sequence', 15, 14, '#bb83f4', 'plasma'), cooldownSeconds: 5.2, windupSeconds: 1.25, activeSeconds: 1.1, recoverySeconds: 1.45, damage: 15, damageType: 'plasma', telegraph: 'fan', sequence: [
        { pattern: 'fan', delaySeconds: 0.2, projectileCount: 5, spreadRadians: 0.55 },
        { pattern: 'radial', delaySeconds: 0.68, projectileCount: 10 },
      ] }),
    ],
    visualParts: [
      part('casing', 'cylinder', [0, 1.7, 0], [1.25, 2.5, 1.25], '#443858', '#8158ae'),
      part('eclipse-core', 'sphere', [0, 2.3, 0.1], [0.72, 0.9, 0.72], '#220f35', '#d2a3ff'),
      part('crown', 'cone', [0, 3.3, 0], [1.1, 1.15, 1.1], '#6d4a84', '#b587e0'),
      part('left-plate', 'box', [-1.12, 1.95, 0], [0.42, 1.45, 0.9], '#58466a'),
      part('right-plate', 'box', [1.12, 1.95, 0], [0.42, 1.45, 0.9], '#58466a'),
      part('core-ring', 'torus', [0, 2.25, 0], [1.05, 0.1, 1.05], '#cc8cff', '#b875f5'),
    ],
    rewards: { gold: 520, healthRecovery: 75, energyRecovery: 75 },
  },
])

export const BOSS_DEFINITIONS_BY_ID = new Map(BOSS_DEFINITIONS.map((definition) => [definition.id, definition]))
