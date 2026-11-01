import type { DamageType, ProjectileDefinition } from '../combat/Combat.types'
import type { EnemyAttackDefinition, EnemyDefinition, EnemyTelegraphShape, EnemyVisualPartDefinition } from '../enemies/Enemy.types'
import { VISUAL_THEME } from './visualTheme'

const colors = VISUAL_THEME.colors

const part = (
  shape: EnemyVisualPartDefinition['shape'],
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  material: EnemyVisualPartDefinition['material'],
  rotation?: readonly [number, number, number],
): EnemyVisualPartDefinition => ({ shape, position, size, material, ...(rotation ? { rotation } : {}) })

const projectile = (id: string, damage: number, damageType: DamageType, color: string, onImpact?: ProjectileDefinition['onImpact'], statusEffects?: ProjectileDefinition['statusEffects']): ProjectileDefinition => ({
  id,
  damage,
  damageType,
  projectileSpeed: 14,
  maxRange: 24,
  projectileRadius: damageType === 'plasma' ? 0.26 : 0.16,
  projectileColor: color,
  projectileEmissive: color,
  projectileEmissiveIntensity: 1.8,
  ...(onImpact ? { onImpact } : {}),
  ...(statusEffects ? { statusEffects } : {}),
})

const attack = (
  id: string,
  type: EnemyAttackDefinition['type'],
  pattern: NonNullable<EnemyAttackDefinition['pattern']>,
  damage: number,
  damageType: DamageType,
  telegraph: EnemyTelegraphShape,
  options: Partial<EnemyAttackDefinition> = {},
): EnemyAttackDefinition => ({
  id,
  type,
  pattern,
  minRange: 0,
  maxRange: 24,
  cooldownSeconds: 3,
  windupSeconds: 0.8,
  activeSeconds: 0.35,
  recoverySeconds: 0.8,
  priority: 10,
  damage,
  damageType,
  telegraph: { shape: telegraph, color: damageType === 'fire' ? '#f07845' : damageType === 'electric' ? '#49d9ff' : damageType === 'cryo' ? '#8de8ff' : damageType === 'plasma' ? '#d2a1ff' : '#f1c16d' },
  ...options,
})

const experimental = (
  role: string,
  description: string,
  weaknesses: readonly DamageType[],
  rewardGold: readonly [number, number],
  maxGeneratedEntities: number,
  testingNotes: string,
  attacks: readonly EnemyAttackDefinition[],
) => ({
  enabledInNormalRuns: false as const,
  role,
  description,
  weaknesses,
  rewardGold,
  maxGeneratedEntities,
  testingNotes,
  attacks,
})

const enemy = (
  id: string,
  name: string,
  maxHealth: number,
  moveSpeed: number,
  collisionRadius: number,
  detectionRange: number,
  behavior: EnemyDefinition['behavior'],
  visual: EnemyDefinition['visual'],
  profile: NonNullable<EnemyDefinition['experimental']>,
  resistances: Partial<Record<DamageType, number>>,
  sounds: NonNullable<EnemyDefinition['sounds']>,
  frontResistance?: EnemyDefinition['frontResistance'],
): EnemyDefinition => Object.freeze({
  id,
  name,
  maxHealth,
  moveSpeed,
  collisionRadius,
  detectionRange,
  behavior,
  attacks: Object.freeze([]),
  visual: Object.freeze(visual),
  resistances: Object.freeze(resistances),
  ...(frontResistance ? { frontResistance: Object.freeze(frontResistance) } : {}),
  sounds: Object.freeze(sounds),
  experimental: Object.freeze({ ...profile, attacks: Object.freeze([...profile.attacks]) }),
})

const SCRAP_RAIDER = enemy(
  'experimental-scrap-raider', 'Forajido de chatarra', 82, 2.4, 0.48, 23,
  { type: 'strafe', preferredDistance: 8.5, tolerance: 1.2, orbitSpeed: 0.72 },
  { bodyColor: '#805840', accentColor: '#bf874b', eyeColor: colors.danger, bodyHeight: 1.65, parts: [
    part('box', [0, 0.9, 0], [0.85, 1, 0.62], 'body'), part('sphere', [0, 1.55, 0.12], [0.42, 0.42, 0.42], 'accent'),
    part('cylinder', [0, 1.9, 0], [0.48, 0.16, 0.48], 'body'), part('box', [0.55, 1.02, 0.35], [0.72, 0.16, 0.18], 'accent'),
    part('cylinder', [0.75, 1.02, 0.35], [0.09, 0.4, 0.09], 'body', [Math.PI / 2, 0, 0]),
  ] },
  experimental('mobile rifle skirmisher', 'Strafes at medium range and fires a three-shot spread before reloading.', ['electric', 'cryo'], [8, 14], 0, 'Observe the three separated projectiles and lateral movement during the cooldown.', [
    attack('scrap-three-shot', 'projectile', { kind: 'fan', projectileCount: 3, spreadRadians: 0.26 }, 9, 'physical', 'fan', {
      minRange: 4, maxRange: 18, cooldownSeconds: 3.4, windupSeconds: 0.55, activeSeconds: 0.25, recoverySeconds: 1.05,
      projectile: projectile('exp.scrap-round', 9, 'physical', '#efbe75'),
    }),
  ]),
  { physical: 0.85, electric: 1.25, cryo: 1.2 },
  { spawn: 'prototype.scrap.spawn', attack: 'prototype.scrap.attack', damaged: 'prototype.scrap.hurt', death: 'prototype.scrap.death' },
)

const ARMORED_RAM = enemy(
  'experimental-armored-ram', 'Embestidor blindado', 250, 1.35, 1.05, 24,
  { type: 'chase', stopDistance: 5.2 },
  { bodyColor: '#58605c', accentColor: '#ad6548', eyeColor: '#ffc15e', bodyHeight: 2.1, parts: [
    part('box', [0, 1.1, 0], [1.55, 1.2, 1.15], 'body'), part('cone', [0, 1.15, 0.9], [0.56, 1.15, 0.56], 'accent', [Math.PI / 2, 0, 0]),
    part('box', [0, 1.75, -0.15], [1.8, 0.45, 1.05], 'accent'), part('sphere', [-0.38, 0.3, -0.25], [0.52, 0.46, 0.52], 'body'),
  ] },
  experimental('armored charger', 'Approaches slowly, telegraphs a collision line, then charges until blocked and recovers.', ['cryo', 'plasma'], [14, 22], 0, 'Check front resistance, obstacle stop, charge telegraph, and long recovery.', [
    attack('ram-charge', 'special', { kind: 'charge', speed: 8.2, maxDistance: 10, collisionRadius: 0.8 }, 30, 'physical', 'line', {
      minRange: 3.5, maxRange: 13, cooldownSeconds: 4.8, windupSeconds: 1.25, activeSeconds: 1.2, recoverySeconds: 1.3,
    }),
  ]),
  { physical: 0.68, fire: 1.2, cryo: 1.25, plasma: 1.2 },
  { spawn: 'prototype.ram.spawn', attack: 'prototype.ram.charge', damaged: 'prototype.ram.hurt', death: 'prototype.ram.death' },
  { halfAngleRadians: 0.82, damageMultiplier: 0.42 },
)

const WASTELAND_GUNNER = enemy(
  'experimental-wasteland-gunner', 'Artillero del páramo', 105, 1.6, 0.52, 26,
  { type: 'keep-distance', preferredDistance: 12, tolerance: 1.4 },
  { bodyColor: '#9a6242', accentColor: '#50585a', eyeColor: '#ffd16e', bodyHeight: 1.9, parts: [
    part('box', [0, 0.98, 0], [0.75, 1.2, 0.62], 'body'), part('sphere', [0, 1.78, 0.02], [0.35, 0.35, 0.35], 'accent'),
    part('cylinder', [0, 1.35, 0.62], [0.19, 1.25, 0.19], 'accent', [Math.PI / 2, 0, 0]),
    part('box', [-0.48, 0.42, 0], [0.38, 0.25, 0.38], 'accent'), part('box', [0.48, 0.42, 0], [0.38, 0.25, 0.38], 'accent'),
  ] },
  experimental('delayed artillery', 'Locks a ground point, then detonates there after a visible delay.', ['electric', 'cryo'], [10, 17], 1, 'Move after the point lock; the marked coordinate must not follow the player.', [
    attack('wasteland-shell', 'area', { kind: 'lobbed-zone', radius: 3.1, delaySeconds: 1.05, activeSeconds: 0.28, tickIntervalSeconds: 0.28, apexHeight: 4.2 }, 28, 'physical', 'ring', {
      minRange: 7, maxRange: 21, cooldownSeconds: 4.4, windupSeconds: 1, activeSeconds: 0.3, recoverySeconds: 1.15,
      telegraph: { shape: 'ring', color: '#f4b65d', radius: 3.1 },
      projectile: projectile('exp.wasteland-shell', 0, 'physical', '#f4b65d'),
    }),
  ]),
  { physical: 1.05, fire: 1.1, electric: 1.2, cryo: 1.2 },
  { spawn: 'prototype.gunner.spawn', attack: 'prototype.gunner.shell', damaged: 'prototype.gunner.hurt', death: 'prototype.gunner.death' },
)

const FOUNDRY_INCENDIARY = enemy(
  'experimental-foundry-incendiary', 'Incendiario de la fundición', 112, 2.1, 0.58, 18,
  { type: 'chase', stopDistance: 3.8 },
  { bodyColor: '#6f3a32', accentColor: '#f17b43', eyeColor: '#ffd16a', bodyHeight: 1.8, parts: [
    part('box', [0, 0.95, 0], [0.78, 1.2, 0.62], 'body'), part('sphere', [0, 1.72, 0.02], [0.37, 0.34, 0.34], 'accent'),
    part('cylinder', [0.48, 1.05, 0.2], [0.22, 0.9, 0.22], 'accent', [0, 0, Math.PI / 2]),
    part('cone', [0.67, 1.08, 0.2], [0.25, 0.56, 0.25], 'eyes', [0, 0, -Math.PI / 2]),
  ] },
  experimental('short-range flame cone', 'Sweeps a narrow cone with limited rotation, alternating burn and cooldown.', ['cryo', 'electric'], [10, 18], 0, 'Stay outside the 55-degree cone during its 0.22 second damage cadence.', [
    attack('incendiary-cone', 'area', { kind: 'cone', range: 5.2, angleRadians: Math.PI / 3.25, tickIntervalSeconds: 0.22 }, 7, 'fire', 'fan', {
      minRange: 0, maxRange: 6.4, cooldownSeconds: 3.4, windupSeconds: 0.78, activeSeconds: 0.88, recoverySeconds: 1.2,
      statusEffects: [{ type: 'burn', durationSeconds: 2, damagePerSecond: 4, tickIntervalSeconds: 0.5 }],
    }),
  ]),
  { fire: 0.58, cryo: 1.35, electric: 1.25 },
  { spawn: 'prototype.incendiary.spawn', attack: 'prototype.incendiary.flame', damaged: 'prototype.incendiary.hurt', death: 'prototype.incendiary.death' },
)

const SCORIA_BEETLE = enemy(
  'experimental-scoria-beetle', 'Escarabajo de escoria', 64, 4.1, 0.62, 22,
  { type: 'chase', stopDistance: 1.5 },
  { bodyColor: '#5e382d', accentColor: '#df6137', eyeColor: '#ffd06a', bodyHeight: 1.15, parts: [
    part('sphere', [0, 0.55, 0], [0.64, 0.42, 0.78], 'body'), part('cone', [0, 0.62, 0.68], [0.31, 0.55, 0.31], 'accent', [Math.PI / 2, 0, 0]),
    part('sphere', [0, 0.85, -0.18], [0.49, 0.31, 0.57], 'eyes'), part('cone', [-0.56, 0.28, 0], [0.17, 0.58, 0.17], 'accent', [0, 0, Math.PI / 2]),
    part('cone', [0.56, 0.28, 0], [0.17, 0.58, 0.17], 'accent', [0, 0, -Math.PI / 2]),
  ] },
  experimental('fuse runner', 'Rushes the nearest target, starts a fixed fuse and can be killed before detonation.', ['cryo', 'plasma'], [4, 8], 2, 'Kill it before the fuse ends; verify no blast or fire zone survives its death.', [
    attack('scoria-fuse', 'special', { kind: 'suicide', fuseSeconds: 2.1, radius: 3.4, fireZoneSeconds: 2.5 }, 25, 'fire', 'ring', {
      minRange: 0, maxRange: 2.8, cooldownSeconds: 6, windupSeconds: 0.4, activeSeconds: 2.1, recoverySeconds: 0.1,
      telegraph: { shape: 'ring', color: '#f07845', radius: 3.4 },
      statusEffects: [{ type: 'burn', durationSeconds: 1.2, damagePerSecond: 3, tickIntervalSeconds: 0.4 }],
    }),
  ]),
  { fire: 0.42, cryo: 1.65, plasma: 1.25 },
  { spawn: 'prototype.scoria.spawn', attack: 'prototype.scoria.fuse', damaged: 'prototype.scoria.hurt', death: 'prototype.scoria.death' },
)

const ASH_SHAMAN = enemy(
  'experimental-ash-shaman', 'Chamán de ceniza', 126, 1.45, 0.55, 25,
  { type: 'keep-distance', preferredDistance: 12.5, tolerance: 1.2 },
  { bodyColor: '#484348', accentColor: '#bc5b3e', eyeColor: '#ffac50', bodyHeight: 2, parts: [
    part('cone', [0, 0.95, 0], [0.69, 1.9, 0.69], 'body'), part('sphere', [0, 1.76, 0.18], [0.33, 0.37, 0.33], 'eyes'),
    part('cylinder', [0.73, 1.2, 0], [0.11, 2.25, 0.11], 'accent'), part('torus', [0.73, 2.3, 0], [0.33, 0.08, 0.33], 'eyes'),
  ] },
  experimental('delayed multi-zone controller', 'Marks three separated floor zones, fixes their positions, then ignites them.', ['cryo', 'physical'], [12, 20], 3, 'Move after lock; inspect the gap between three markers and the finite fire lifetime.', [
    attack('ash-groundmarks', 'area', { kind: 'multi-zone', zoneCount: 3, radius: 2.1, spreadDistance: 4.4, delaySeconds: 1.15, activeSeconds: 2.4, tickIntervalSeconds: 0.55 }, 8, 'fire', 'markers', {
      minRange: 4, maxRange: 19, cooldownSeconds: 5.2, windupSeconds: 0.9, activeSeconds: 0.2, recoverySeconds: 1.2,
      statusEffects: [{ type: 'burn', durationSeconds: 1.8, damagePerSecond: 3, tickIntervalSeconds: 0.45 }],
    }),
  ]),
  { fire: 0.5, cryo: 1.25, physical: 1.15 },
  { spawn: 'prototype.shaman.spawn', attack: 'prototype.shaman.mark', damaged: 'prototype.shaman.hurt', death: 'prototype.shaman.death' },
)

const STORM_SENTINEL = enemy(
  'experimental-storm-sentinel', 'Centinela de tormenta', 148, 0.75, 0.7, 24,
  { type: 'hold', preferredDistance: 11 },
  { bodyColor: '#374d5c', accentColor: '#3e9bc0', eyeColor: '#a6f5ff', bodyHeight: 2.1, parts: [
    part('cylinder', [0, 0.95, 0], [0.54, 1.65, 0.54], 'body'), part('sphere', [0, 1.86, 0], [0.4, 0.43, 0.4], 'accent'),
    part('cylinder', [0, 2.12, 0], [0.72, 0.12, 0.72], 'eyes'), part('cylinder', [0.64, 0.93, 0], [0.12, 1.7, 0.12], 'accent'),
  ] },
  experimental('charged electric line', 'Locks a straight line, checks obstacles, then resolves one direct line strike.', ['physical', 'plasma'], [12, 19], 0, 'The line width matches the damage corridor and a wall must block the shot.', [
    attack('storm-lance', 'area', { kind: 'line', range: 19, width: 0.58 }, 26, 'electric', 'line', {
      minRange: 4, maxRange: 19, cooldownSeconds: 4.2, windupSeconds: 1.05, activeSeconds: 0.24, recoverySeconds: 1.4,
      statusEffects: [{ type: 'shock', staggerSeconds: 0.18 }],
    }),
  ]),
  { electric: 0.46, physical: 1.1, plasma: 1.2 },
  { spawn: 'prototype.sentinel.spawn', attack: 'prototype.sentinel.lance', damaged: 'prototype.sentinel.hurt', death: 'prototype.sentinel.death' },
)

const ARC_WEAVER = enemy(
  'experimental-arc-weaver', 'Tejedor de arcos', 134, 1.55, 0.56, 24,
  { type: 'strafe', preferredDistance: 9.5, tolerance: 1.1, orbitSpeed: 0.48 },
  { bodyColor: '#42485a', accentColor: '#3e9bd2', eyeColor: '#9ceeff', bodyHeight: 1.75, parts: [
    part('sphere', [0, 1.16, 0], [0.52, 0.54, 0.5], 'body'), part('sphere', [0, 1.58, 0.3], [0.25, 0.24, 0.2], 'eyes'),
    part('cone', [-0.67, 0.95, 0], [0.22, 1.15, 0.22], 'accent', [0, 0, Math.PI / 2]),
    part('cone', [0.67, 0.95, 0], [0.22, 1.15, 0.22], 'accent', [0, 0, -Math.PI / 2]),
    part('sphere', [0, 2.05, 0], [0.22, 0.22, 0.22], 'eyes'),
  ] },
  experimental('destructible arc-link builder', 'Places two damageable nodes and creates a short, line-of-sight checked electric link.', ['physical', 'cryo'], [14, 22], 3, 'Destroy either node before activation; links never cross obstacle colliders.', [
    attack('weaver-link', 'special', { kind: 'arc-nodes', nodeRange: 11, linkWidth: 0.48, activeSeconds: 2.8, tickIntervalSeconds: 0.45 }, 14, 'electric', 'markers', {
      minRange: 4, maxRange: 16, cooldownSeconds: 7.5, windupSeconds: 1.15, activeSeconds: 0.3, recoverySeconds: 1.3,
      statusEffects: [{ type: 'shock', staggerSeconds: 0.16 }],
    }),
    attack('weaver-needle', 'projectile', { kind: 'direct' }, 11, 'electric', 'line', {
      minRange: 7, maxRange: 22, cooldownSeconds: 2.8, windupSeconds: 0.62, activeSeconds: 0.12, recoverySeconds: 0.55,
      projectile: projectile('exp.arc-needle', 11, 'electric', '#5be3ff', { chain: { range: 4.2, damageMultiplier: 0.5, maxTargets: 2 } }, [{ type: 'shock', staggerSeconds: 0.1 }]),
    }),
  ]),
  { electric: 0.5, physical: 1.12, cryo: 1.2 },
  { spawn: 'prototype.weaver.spawn', attack: 'prototype.weaver.arc', damaged: 'prototype.weaver.hurt', death: 'prototype.weaver.death' },
)

const VOLT_HOUND = enemy(
  'experimental-volt-hound', 'Sabueso voltaico', 96, 4.4, 0.52, 25,
  { type: 'chase', stopDistance: 1.1 },
  { bodyColor: '#354552', accentColor: '#49aaca', eyeColor: '#bcf9ff', bodyHeight: 1.1, parts: [
    part('sphere', [0, 0.55, 0], [0.56, 0.34, 0.83], 'body'), part('cone', [0, 0.61, 0.72], [0.27, 0.56, 0.27], 'accent', [Math.PI / 2, 0, 0]),
    part('sphere', [0, 0.83, -0.27], [0.32, 0.22, 0.36], 'eyes'),
    part('cone', [-0.43, 0.28, -0.08], [0.16, 0.55, 0.16], 'accent', [0, 0, Math.PI / 2]), part('cone', [0.43, 0.28, -0.08], [0.16, 0.55, 0.16], 'accent', [0, 0, -Math.PI / 2]),
  ] },
  experimental('short lunge and landing discharge', 'Alternates pursuit pauses with an anticipated short leap and one area pulse.', ['cryo', 'physical'], [8, 14], 1, 'The landing circle should hit once, regardless of render framerate.', [
    attack('volt-pounce', 'special', { kind: 'leap', maxDistance: 4.6, landingRadius: 2.35 }, 22, 'electric', 'ring', {
      minRange: 2, maxRange: 7, cooldownSeconds: 3.8, windupSeconds: 0.72, activeSeconds: 0.25, recoverySeconds: 1.05,
      telegraph: { shape: 'ring', color: '#49d9ff', radius: 2.35 },
      statusEffects: [{ type: 'shock', staggerSeconds: 0.2 }],
    }),
  ]),
  { electric: 0.48, cryo: 1.3, physical: 1.15 },
  { spawn: 'prototype.hound.spawn', attack: 'prototype.hound.pounce', damaged: 'prototype.hound.hurt', death: 'prototype.hound.death' },
)

const FROST_SHARPSHOOTER = enemy(
  'experimental-frost-sharpshooter', 'Tirador de escarcha', 102, 1.85, 0.5, 25,
  { type: 'strafe', preferredDistance: 12, tolerance: 1.3, orbitSpeed: 0.6 },
  { bodyColor: '#527079', accentColor: '#a6d4d7', eyeColor: '#d9fbff', bodyHeight: 1.9, parts: [
    part('box', [0, 1, 0], [0.74, 1.25, 0.6], 'body'), part('sphere', [0, 1.78, 0.03], [0.34, 0.34, 0.34], 'accent'),
    part('cone', [0, 1.34, 0.65], [0.16, 1.3, 0.16], 'eyes', [Math.PI / 2, 0, 0]),
    part('box', [0, 2.03, -0.08], [0.86, 0.16, 0.82], 'accent'),
  ] },
  experimental('slow cryogenic fan', 'Repositions between five slow projectiles with a deliberate gap in the fan.', ['fire', 'plasma'], [10, 16], 0, 'Confirm fan gaps remain traversable and slow is capped above 45% movement.', [
    attack('frost-fan', 'projectile', { kind: 'fan', projectileCount: 5, spreadRadians: 1.12 }, 8, 'cryo', 'fan', {
      minRange: 6, maxRange: 20, cooldownSeconds: 4.2, windupSeconds: 0.85, activeSeconds: 0.18, recoverySeconds: 1.1,
      projectile: projectile('exp.frost-shard', 8, 'cryo', '#a8f3ff', undefined, [{ type: 'slow', durationSeconds: 1.5, movementMultiplier: 0.68 }]),
    }),
  ]),
  { cryo: 0.42, fire: 1.35, plasma: 1.25 },
  { spawn: 'prototype.frost.spawn', attack: 'prototype.frost.fan', damaged: 'prototype.frost.hurt', death: 'prototype.frost.death' },
)

const CRYSTAL_EXCAVATOR = enemy(
  'experimental-crystal-excavator', 'Excavador de cristal', 178, 2.35, 0.82, 22,
  { type: 'chase', stopDistance: 2.5 },
  { bodyColor: '#4d6764', accentColor: '#51d1cf', eyeColor: '#b3fff3', bodyHeight: 1.55, parts: [
    part('sphere', [0, 0.75, 0], [0.8, 0.57, 0.8], 'body'), part('cone', [0, 0.85, 0.82], [0.42, 1, 0.42], 'accent', [Math.PI / 2, 0, 0]),
    part('cone', [-0.56, 0.62, 0], [0.3, 0.9, 0.3], 'eyes', [0, 0, Math.PI / 2]), part('cone', [0.56, 0.62, 0], [0.3, 0.9, 0.3], 'eyes', [0, 0, -Math.PI / 2]),
    part('torus', [0, 1.45, -0.1], [0.54, 0.12, 0.54], 'accent'),
  ] },
  experimental('telegraphed underground ambusher', 'Dives along a collision-safe path, shows its exit marker, then emerges with a cryo wave.', ['fire', 'electric'], [16, 25], 1, 'Check underground marker, wall-safe movement, delayed emergence, and no spawn inside blockers.', [
    attack('crystal-emerge', 'special', { kind: 'burrow', travelDistance: 6.5, emergeRadius: 3.1, emergeDelaySeconds: 0.62 }, 24, 'cryo', 'burrow', {
      minRange: 0, maxRange: 13, cooldownSeconds: 5.5, windupSeconds: 0.82, activeSeconds: 1.25, recoverySeconds: 1.25,
      telegraph: { shape: 'burrow', color: '#8de8ff', radius: 3.1 },
      statusEffects: [{ type: 'slow', durationSeconds: 1.2, movementMultiplier: 0.72 }],
    }),
  ]),
  { cryo: 0.38, electric: 1.25, fire: 1.2 },
  { spawn: 'prototype.excavator.spawn', attack: 'prototype.excavator.emerge', damaged: 'prototype.excavator.hurt', death: 'prototype.excavator.death' },
)

const PLASMA_CUSTODIAN = enemy(
  'experimental-plasma-custodian', 'Custodio de plasma', 320, 1.05, 0.95, 25,
  { type: 'hold', preferredDistance: 10 },
  { bodyColor: '#4c4358', accentColor: '#a64ee8', eyeColor: '#ffd3ff', bodyHeight: 2.35, parts: [
    part('cylinder', [0, 1.05, 0], [0.73, 1.72, 0.73], 'body'), part('sphere', [0, 2, 0.04], [0.47, 0.43, 0.47], 'accent'),
    part('torus', [0, 1.32, 0], [0.95, 0.13, 0.95], 'eyes'), part('cylinder', [0, 2.3, 0], [0.82, 0.12, 0.82], 'accent'),
    part('sphere', [0, 2.48, 0], [0.22, 0.24, 0.22], 'eyes'),
  ] },
  experimental('slow plasma elite', 'Alternates a delayed explosive sphere and a radial volley with wide safe gaps.', ['cryo', 'electric'], [24, 36], 0, 'The projectile explodes only on impact; radial shots are one volley with 12 readable gaps.', [
    attack('custodian-orb', 'projectile', { kind: 'projectile-explosion', radius: 2.7, damageMultiplier: 0.72 }, 24, 'plasma', 'ring', {
      minRange: 5, maxRange: 22, cooldownSeconds: 4.5, windupSeconds: 1.05, activeSeconds: 0.15, recoverySeconds: 1.2,
      telegraph: { shape: 'ring', color: '#d2a1ff', radius: 2.7 },
      projectile: projectile('exp.custodian-orb', 24, 'plasma', '#c793ff'),
    }),
    attack('custodian-volley', 'projectile', { kind: 'radial', projectileCount: 12 }, 12, 'plasma', 'radial', {
      minRange: 0, maxRange: 16, cooldownSeconds: 5.4, windupSeconds: 1.15, activeSeconds: 0.2, recoverySeconds: 1.4,
      projectile: { ...projectile('exp.custodian-volley', 12, 'plasma', '#dbb6ff'), maxRange: 16 },
    }),
  ]),
  { plasma: 0.42, cryo: 1.28, electric: 1.25 },
  { spawn: 'prototype.custodian.spawn', attack: 'prototype.custodian.orb', damaged: 'prototype.custodian.hurt', death: 'prototype.custodian.death' },
)

export const EXPERIMENTAL_ENEMY_DEFINITIONS: readonly EnemyDefinition[] = Object.freeze([
  SCRAP_RAIDER,
  ARMORED_RAM,
  WASTELAND_GUNNER,
  FOUNDRY_INCENDIARY,
  SCORIA_BEETLE,
  ASH_SHAMAN,
  STORM_SENTINEL,
  ARC_WEAVER,
  VOLT_HOUND,
  FROST_SHARPSHOOTER,
  CRYSTAL_EXCAVATOR,
  PLASMA_CUSTODIAN,
])

export const EXPERIMENTAL_ENEMY_BY_ID = new Map(EXPERIMENTAL_ENEMY_DEFINITIONS.map((definition) => [definition.id, definition]))
