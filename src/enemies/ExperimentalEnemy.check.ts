import * as THREE from 'three'
import { CombatSystem } from '../combat/CombatSystem'
import type { Damageable } from '../combat/Damageable'
import { DamageResolver } from '../combat/DamageResolver'
import { StatusEffects } from '../combat/StatusEffects'
import { REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE } from '../config/combat.config'
import { CAMPAIGN_CHAPTERS } from '../config/campaignChapters.config'
import { BOSS_DEFINITIONS } from '../config/bosses.config'
import { ENEMY_DEFINITIONS } from '../config/enemies.config'
import { EXPERIMENTAL_ENEMY_DEFINITIONS } from '../config/experimentalEnemies.config'
import { WAVE_DEFINITIONS } from '../config/waves.config'
import { Player } from '../entities/Player'
import { ExperimentalEnemyFactory, validateExperimentalEnemyCatalog } from './ExperimentalEnemyFactory'
import { EnemyHazardManager } from './EnemyHazardManager'
import { EnemyVisual } from './EnemyVisual'
import type { DamageContext, ProjectileDefinition } from '../combat/Combat.types'

class TestTarget implements Damageable {
  readonly faction: string
  readonly combatId: string
  health = 100
  readonly damageContexts: DamageContext[] = []
  readonly statuses: string[] = []
  x: number
  z: number
  private readonly radius: number

  constructor(combatId: string, x: number, z: number, radius = 0.32, faction = 'enemies') {
    this.combatId = combatId
    this.x = x
    this.z = z
    this.radius = radius
    this.faction = faction
  }

  getCombatBounds(): { readonly x: number; readonly z: number; readonly radius: number } {
    return { x: this.x, z: this.z, radius: this.radius }
  }

  applyDamage(context: DamageContext): void {
    this.damageContexts.push(context)
    this.health = Math.max(0, this.health - context.amount)
  }

  applyStatusEffect(effect: { readonly type: string }): void {
    this.statuses.push(effect.type)
  }
}

export function runExperimentalEnemyChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const close = (actual: number, expected: number, label: string, tolerance = 1e-6): void => {
    check(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, label)
  }
  validateExperimentalEnemyCatalog(EXPERIMENTAL_ENEMY_DEFINITIONS)
  check(EXPERIMENTAL_ENEMY_DEFINITIONS.length === 12, 'Experimental catalog contains all twelve requested enemy profiles')
  check(new Set(EXPERIMENTAL_ENEMY_DEFINITIONS.map((entry) => entry.id)).size === 12, 'Experimental enemy IDs are unique')
  check(EXPERIMENTAL_ENEMY_DEFINITIONS.every((entry) => entry.experimental?.enabledInNormalRuns === false && entry.attacks.length === 0), 'Every new profile is disabled and excluded from the standard EnemyDefinition attack list')
  check(EXPERIMENTAL_ENEMY_DEFINITIONS.every((entry) => entry.visual.parts && entry.visual.parts.length >= 4), 'Each profile has a data-driven recognizable silhouette')
  check(EXPERIMENTAL_ENEMY_DEFINITIONS.every((entry) => entry.experimental?.attacks.every((attack) => attack.pattern && attack.telegraph)), 'Every experimental attack has a behavior pattern and a visible telegraph')
  check(EXPERIMENTAL_ENEMY_DEFINITIONS.every((entry) => entry.experimental?.weaknesses.every((type) => (entry.resistances?.[type] ?? 1) > 1)), 'Every documented weakness is an actual increased damage multiplier')
  const activeVisual = new EnemyVisual(ENEMY_DEFINITIONS[0].visual)
  const prototypeVisual = new EnemyVisual(EXPERIMENTAL_ENEMY_DEFINITIONS[0].visual)
  check(activeVisual.root.getObjectByName('ExperimentalEnemyTelegraph') === undefined, 'Normal enemy visuals do not allocate prototype telegraph geometry')
  check(prototypeVisual.root.getObjectByName('ExperimentalEnemyTelegraph') !== undefined, 'Prototype visuals allocate only their opt-in telegraph geometry')
  activeVisual.dispose()
  prototypeVisual.dispose()
  const newIds = new Set(EXPERIMENTAL_ENEMY_DEFINITIONS.map((entry) => entry.id))
  const activeIds = new Set([
    ...ENEMY_DEFINITIONS.map((entry) => entry.id),
    ...WAVE_DEFINITIONS.flatMap((wave) => wave.spawnGroups.map((group) => group.enemyId)),
    ...CAMPAIGN_CHAPTERS.flatMap((chapter) => chapter.waves.flatMap((wave) => wave.spawnGroups.map((group) => group.enemyId))),
    ...BOSS_DEFINITIONS.flatMap((boss) => boss.attacks.flatMap((attack) => attack.summonEnemyId ? [attack.summonEnemyId] : [])),
  ])
  check([...newIds].every((id) => !activeIds.has(id)), 'No experimental enemy appears in active runs, campaign waves, or boss summons')
  check(ENEMY_DEFINITIONS.length === 2, 'The active enemy set remains unchanged')
  check(ENEMY_DEFINITIONS.every((entry) => entry.attacks.every((attack) => attack.damageType === 'physical' || attack.damageType === 'plasma')),
    'Existing active attacks keep their original non-elemental damage behavior')

  const statuses = new StatusEffects()
  let burnDamage = 0
  statuses.apply({ type: 'burn', durationSeconds: 2, damagePerSecond: 4, tickIntervalSeconds: 0.5 }, { id: 'flame', faction: 'enemies' })
  statuses.apply({ type: 'burn', durationSeconds: 2, damagePerSecond: 8, tickIntervalSeconds: 0.5 }, { id: 'flame', faction: 'enemies' })
  statuses.update(0.5, (context) => { burnDamage += context.amount })
  close(burnDamage, 4, 'Burn refreshes with strongest DPS instead of stacking')
  statuses.apply({ type: 'slow', durationSeconds: 1.5, movementMultiplier: 0.7 }, { id: 'frost', faction: 'enemies' })
  statuses.apply({ type: 'slow', durationSeconds: 20, movementMultiplier: 0.1 }, { id: 'frost', faction: 'enemies' })
  close(statuses.movementMultiplier, 0.45, 'Slow is capped and cannot immobilize a target')
  statuses.apply({ type: 'shock', staggerSeconds: 1 }, { id: 'storm', faction: 'enemies' })
  check(statuses.isStaggered, 'Electric shock activates the short stagger state')
  statuses.update(0.35, () => undefined)
  check(!statuses.isStaggered, 'Shock duration is capped at 0.35 seconds')
  statuses.update(8, () => undefined)
  check(statuses.activeTypes.length === 0 && statuses.movementMultiplier === 1, 'Burn and slow expire and restore normal movement')
  statuses.clear()

  const resolver = new DamageResolver()
  let resolvedDamage = 0
  let resolvedStatus = ''
  const resistantTarget: Damageable = {
    combatId: 'resistant-target', faction: 'enemies',
    getCombatBounds: () => ({ x: 0, z: 0, radius: 0.4 }),
    getDamageMultiplier: () => 1.5,
    applyDamage: (context) => { resolvedDamage = context.amount },
    applyStatusEffect: (effect) => { resolvedStatus = effect.type },
  }
  check(resolver.apply(resistantTarget, { sourceId: 'player', sourceFaction: 'player', amount: 10, type: 'fire', effects: [{ type: 'burn', durationSeconds: 1, damagePerSecond: 3 }] }), 'Damage resolver accepts an elemental hit')
  close(resolvedDamage, 15, 'Resistance/vulnerability multipliers are applied in DamageResolver')
  check(resolvedStatus === 'burn', 'Valid hit applies its configured status separately from damage type')

  const statusEffects = new StatusEffects()
  let burnTickDamage = 0
  statusEffects.apply({ type: 'burn', durationSeconds: 2, damagePerSecond: 4, tickIntervalSeconds: 0.5 }, { id: 'burn-source', faction: 'enemies' })
  statusEffects.apply({ type: 'burn', durationSeconds: 2, damagePerSecond: 8, tickIntervalSeconds: 0.5 }, { id: 'burn-source', faction: 'enemies' })
  statusEffects.update(0.5, (context) => { burnTickDamage += context.amount })
  close(burnTickDamage, 4, 'Burn refresh takes strongest DPS without adding stacks')
  statusEffects.apply({ type: 'slow', durationSeconds: 1, movementMultiplier: 0.7 }, { id: 'cryo-source', faction: 'enemies' })
  statusEffects.apply({ type: 'slow', durationSeconds: 8, movementMultiplier: 0.1 }, { id: 'cryo-source', faction: 'enemies' })
  close(statusEffects.movementMultiplier, 0.45, 'Slow floor prevents stacking to immobility')
  statusEffects.apply({ type: 'shock', staggerSeconds: 2 }, { id: 'electric-source', faction: 'enemies' })
  check(statusEffects.isStaggered, 'Electric stagger is exposed to gameplay')
  statusEffects.update(0.35, () => undefined)
  check(!statusEffects.isStaggered, 'Electric stagger expires at its hard duration cap')
  statusEffects.update(8, () => undefined)
  check(statusEffects.activeTypes.length === 0 && statusEffects.movementMultiplier === 1, 'Burn and slow expire and restore normal state')
  const statusPlayer = new Player()
  try {
    const startX = statusPlayer.position.x
    statusPlayer.applyStatusEffect({ type: 'shock', staggerSeconds: 0.3 }, { id: 'test-electric', faction: 'enemies' })
    statusPlayer.update(new THREE.Vector3(1, 0, 0), 0.2, [])
    close(statusPlayer.position.x, startX, 'Electric stagger prevents player movement during its short duration')
    statusPlayer.update(new THREE.Vector3(1, 0, 0), 0.2, [])
    check(statusPlayer.position.x > startX, 'Player movement resumes after stagger expires')
  } finally { statusPlayer.dispose() }

  const zoneScene = new THREE.Scene()
  const zoneCombat = new CombatSystem(zoneScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const zoneManager = new EnemyHazardManager(zoneScene, [], zoneCombat)
  const zoneTarget = new TestTarget('zone-target', 0.8, 0.32, 0.32, 'player')
  try {
    const hazardId = zoneManager.createZone({
      ownerId: 'ash-shaman-test', center: new THREE.Vector3(0, 0, 0), radius: 2,
      warningSeconds: 0.4, activeSeconds: 1, tickIntervalSeconds: 0.25,
      damage: 10, damageType: 'fire', color: '#f07845',
    })
    check(hazardId !== null, 'Hazard manager accepts a valid delayed fire zone')
    zoneManager.update(0.2, [zoneTarget])
    zoneManager.update(0.2, [zoneTarget])
    close(zoneTarget.health, 100, 'Marked zones do not damage before their warning expires')
    zoneManager.update(0.01, [zoneTarget])
    zoneManager.update(0.1, [zoneTarget])
    zoneManager.update(0.14, [zoneTarget])
    close(zoneTarget.health, 80, 'Area damage follows its fixed 0.25 second cadence, not frame count')
    zoneManager.removeOwner('ash-shaman-test')
    check(zoneManager.activeCount === 0, 'Removing a dead hazard owner clears its persistent zones')

    zoneManager.setOwnerLimit('bounded', 2)
    for (let index = 0; index < 2; index++) check(zoneManager.createZone({
      ownerId: 'bounded', center: new THREE.Vector3(index * 4, 0, 0), radius: 1,
      warningSeconds: 2, activeSeconds: 4, tickIntervalSeconds: 0.5,
      damage: 1, damageType: 'physical', color: '#ffffff',
    }) !== null, 'Zone fits within owner limit')
    check(zoneManager.createZone({
      ownerId: 'bounded', center: new THREE.Vector3(9, 0, 0), radius: 1,
      warningSeconds: 2, activeSeconds: 4, tickIntervalSeconds: 0.5,
      damage: 1, damageType: 'physical', color: '#ffffff',
    }) === null, 'Persistent hazards respect per-enemy limits')
  } finally {
    zoneManager.dispose()
    zoneCombat.dispose()
  }

  const wallScene = new THREE.Scene()
  const wallCombat = new CombatSystem(wallScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const obstacle = new THREE.Box2(new THREE.Vector2(-0.2, -1), new THREE.Vector2(0.2, 1))
  const wallHazards = new EnemyHazardManager(wallScene, [obstacle], wallCombat)
  try {
    check(wallHazards.createArcLink({
      ownerId: 'weaver-test', start: new THREE.Vector3(-2, 0, 0), end: new THREE.Vector3(2, 0, 0),
      warningSeconds: 0.5, activeSeconds: 1, tickIntervalSeconds: 0.25, width: 0.4,
      damage: 10, damageType: 'electric', color: '#49d9ff', nodeHealth: 20,
    }) === null, 'Electric arcs reject node links through walls')
  } finally {
    wallHazards.dispose()
    wallCombat.dispose()
  }

  const nodeScene = new THREE.Scene()
  const nodeCombat = new CombatSystem(nodeScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const nodeHazards = new EnemyHazardManager(nodeScene, [], nodeCombat)
  try {
    const linkId = nodeHazards.createArcLink({
      ownerId: 'weaver-node-test', start: new THREE.Vector3(4, 0, 0), end: new THREE.Vector3(4, 0, 4),
      warningSeconds: 0.1, activeSeconds: 2, tickIntervalSeconds: 0.25, width: 0.42,
      damage: 8, damageType: 'electric', color: '#49d9ff', nodeHealth: 20,
    })
    check(linkId !== null && nodeScene.getObjectByName(`ArcNode:${linkId}:node:0`) !== undefined, 'Arc links create explicitly targetable temporary nodes')
    nodeCombat.spawnProjectile({ id: 'node-breaker', damage: 30, projectileSpeed: 30, maxRange: 10, projectileRadius: 0.1, damageType: 'physical' }, { id: 'node-breaker-source', faction: 'player' }, new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(1, 0, 0))
    nodeCombat.update(0.2, false, new THREE.Vector3(), new THREE.Vector3())
    nodeHazards.update(0, [])
    check(nodeHazards.activeCount === 0 && nodeScene.getObjectByName(`ArcNode:${linkId}:node:1`) === undefined, 'Destroying either link node cancels the arc and cleans its sibling')
  } finally {
    nodeHazards.dispose()
    nodeCombat.dispose()
  }

  const splashTargets = [new TestTarget('direct', 2, 0), new TestTarget('splash-near', 3, 0), new TestTarget('splash-far', 5, 0)]
  const splashCombat = createProjectileCombat(splashTargets, [])
  try {
    const splashShot = makeProjectile('fire-test', 'fire', 20, { splash: { radius: 2.2, damageMultiplier: 0.5, maxTargets: 1 } })
    fireAndAdvance(splashCombat, splashShot, 0.1)
    close(splashTargets[0].health, 80, 'Direct projectile damage remains distinct from splash damage')
    close(splashTargets[1].health, 90, 'Explosion damages only the nearest configured secondary target')
    close(splashTargets[2].health, 100, 'Explosion target cap prevents unbounded area hits')
  } finally { splashCombat.dispose() }

  const chainTargets = [new TestTarget('chain-direct', 2, 0), new TestTarget('chain-second', 3.8, 0), new TestTarget('chain-third', 5.5, 0)]
  const chainCombat = createProjectileCombat(chainTargets, [])
  try {
    const chainShot = makeProjectile('electric-test', 'electric', 20, { chain: { range: 2.2, damageMultiplier: 0.5, maxTargets: 2 } })
    fireAndAdvance(chainCombat, chainShot, 0.2)
    close(chainTargets[0].health, 80, 'Electric projectile directly damages its first target once')
    close(chainTargets[1].health, 90, 'Configured chain reaches the next target once')
    close(chainTargets[2].health, 100, 'maxTargets includes the direct hit and chain stops without revisiting')
  } finally { chainCombat.dispose() }

  const blockedChainTargets = [new TestTarget('blocked-direct', 2, 0), new TestTarget('blocked-next', 3.8, 0)]
  const blockedChainCombat = createProjectileCombat(blockedChainTargets, [new THREE.Box2(new THREE.Vector2(2.7, -1), new THREE.Vector2(2.9, 1))])
  try {
    fireAndAdvance(blockedChainCombat, makeProjectile('electric-blocked', 'electric', 20, { chain: { range: 3, damageMultiplier: 0.5, maxTargets: 2 } }), 0.2)
    close(blockedChainTargets[1].health, 100, 'Electric chaining respects line-of-sight obstacles')
  } finally { blockedChainCombat.dispose() }

  const factoryScene = new THREE.Scene()
  const factoryCombat = new CombatSystem(factoryScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const target = new TestTarget('factory-target', 0, 0)
  const authority = { role: 'host' as const, getTargets: () => [target], random: () => 0.25 }
  const factory = new ExperimentalEnemyFactory(factoryScene, [], factoryCombat, authority)
  try {
    const positions = EXPERIMENTAL_ENEMY_DEFINITIONS.map((_, index) => {
      const angle = index * Math.PI * 2 / EXPERIMENTAL_ENEMY_DEFINITIONS.length
      return new THREE.Vector3(Math.cos(angle) * 15, 0, Math.sin(angle) * 15)
    })
    for (let index = 0; index < EXPERIMENTAL_ENEMY_DEFINITIONS.length; index++) {
      const created = factory.create(EXPERIMENTAL_ENEMY_DEFINITIONS[index].id, positions[index])
      check(created.definition.experimental?.enabledInNormalRuns === false, 'Explicit factory creates only disabled prototype definitions')
    }
    check(factory.manager.aliveCount === 12, 'Manual prototype factory can instantiate every catalog profile without using active spawners')
    const armored = factory.manager.getAlive().find((enemy) => enemy.definition.id === 'experimental-armored-ram')!
    const startHealth = armored.currentHealth
    factoryCombat.applyDamage(armored, { sourceId: target.combatId, sourceFaction: 'player', amount: 100, type: 'physical', sourcePosition: [armored.root.position.x, 1, armored.root.position.z + 8] })
    const frontDamage = startHealth - armored.currentHealth
    const rearPosition = [armored.root.position.x, 1, armored.root.position.z - 8] as const
    factoryCombat.applyDamage(armored, { sourceId: target.combatId, sourceFaction: 'player', amount: 100, type: 'physical', sourcePosition: rearPosition })
    const rearDamage = startHealth - frontDamage - armored.currentHealth
    check(frontDamage > 0 && frontDamage < rearDamage, 'Armored Ram has finite directional front resistance, not invulnerability')
    const sentinel = factory.manager.getAlive().find((enemy) => enemy.definition.id === 'experimental-storm-sentinel')!
    check(sentinel.getDamageMultiplier('electric') < 1 && sentinel.getDamageMultiplier('plasma') > 1, 'Elemental resistance and vulnerability change resolved gameplay damage')
  } finally {
    factory.dispose()
    factoryCombat.dispose()
  }

  const phaseScene = new THREE.Scene()
  const phaseCombat = new CombatSystem(phaseScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const firstTarget = new TestTarget('first-target', 0, 0, 0.32, 'player')
  let phaseTargets: readonly Damageable[] = [firstTarget]
  const phaseFactory = new ExperimentalEnemyFactory(phaseScene, [], phaseCombat, { role: 'host', getTargets: () => phaseTargets, random: () => 0.25 })
  try {
    const raider = phaseFactory.create('experimental-scrap-raider', new THREE.Vector3(8, 0, 0))
    phaseFactory.update(0.01)
    check(raider.currentExperimentalAttack?.phase === 'windup', 'Prototype attack exposes its configured windup phase')
    phaseTargets = [new TestTarget('replacement-target', -8, 0, 0.32, 'player')]
    phaseFactory.update(0.01)
    check(raider.currentExperimentalAttack === null, 'A target change during windup cancels the locked attack')
  } finally {
    phaseFactory.dispose()
    phaseCombat.dispose()
  }

  const disconnectScene = new THREE.Scene()
  const disconnectCombat = new CombatSystem(disconnectScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  let disconnectTargets: readonly Damageable[] = [new TestTarget('disconnect-target', 0, 0, 0.32, 'player')]
  const disconnectFactory = new ExperimentalEnemyFactory(disconnectScene, [], disconnectCombat, { role: 'host', getTargets: () => disconnectTargets })
  try {
    const raider = disconnectFactory.create('experimental-scrap-raider', new THREE.Vector3(8, 0, 0))
    disconnectFactory.update(0.01)
    check(raider.currentExperimentalAttack?.phase === 'windup', 'Disconnect test starts with a live telegraph')
    disconnectTargets = []
    disconnectFactory.update(0.01)
    check(raider.currentExperimentalAttack === null, 'Losing every target cancels the experimental windup immediately')
  } finally {
    disconnectFactory.dispose()
    disconnectCombat.dispose()
  }

  const rangeScene = new THREE.Scene()
  const rangeCombat = new CombatSystem(rangeScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const rangeTarget = new TestTarget('range-target', 0, 0, 0.32, 'player')
  const rangeFactory = new ExperimentalEnemyFactory(rangeScene, [], rangeCombat, { role: 'host', getTargets: () => [rangeTarget] })
  try {
    const raider = rangeFactory.create('experimental-scrap-raider', new THREE.Vector3(8, 0, 0))
    rangeFactory.update(0.01)
    rangeTarget.x = 50
    rangeFactory.update(0.01)
    check(raider.currentExperimentalAttack === null, 'A target leaving detection/range cancels its locked windup')
  } finally {
    rangeFactory.dispose()
    rangeCombat.dispose()
  }

  const fanScene = new THREE.Scene()
  const fanCombat = new CombatSystem(fanScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const fanTarget = new TestTarget('fan-target', 0, 0, 0.32, 'player')
  const fanFactory = new ExperimentalEnemyFactory(fanScene, [], fanCombat, { role: 'host', getTargets: () => [fanTarget], random: () => 0.25 })
  try {
    const raider = fanFactory.create('experimental-scrap-raider', new THREE.Vector3(8, 0, 0))
    fanFactory.update(0.01)
    fanFactory.update(0.55)
    check(raider.currentExperimentalAttack?.phase === 'active' && fanCombat.projectileCount === 3, 'Scrap Raider executes a three-projectile fan on active')
    fanFactory.update(0.22)
    fanFactory.update(0.22)
    check(fanCombat.projectileCount === 3, 'Scrap Raider fires one three-shot volley, then uses its reload recovery')
  } finally {
    fanFactory.dispose()
    fanCombat.dispose()
  }

  const artilleryScene = new THREE.Scene()
  const artilleryCombat = new CombatSystem(artilleryScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const artilleryTarget = new TestTarget('artillery-target', 0, 0, 0.32, 'player')
  const artilleryFactory = new ExperimentalEnemyFactory(artilleryScene, [], artilleryCombat, { role: 'host', getTargets: () => [artilleryTarget], random: () => 0.5 })
  try {
    artilleryFactory.create('experimental-wasteland-gunner', new THREE.Vector3(12, 0, 0))
    artilleryFactory.update(0.01)
    artilleryTarget.x = 1
    artilleryFactory.update(1)
    const arcProjectile = artilleryScene.getObjectByName('Projectile:exp.wasteland-shell') as THREE.Mesh | undefined
    const markedZone = artilleryScene.children.find((object) => object.name.startsWith('EnemyHazard:')) as THREE.Group | undefined
    check(arcProjectile !== undefined && markedZone !== undefined, 'Artillery launches a visible lob and a delayed impact marker')
    close(markedZone!.children[0].position.x, 0, 'Artillery impact coordinate stays locked when the target moves during windup')
    const launchHeight = arcProjectile!.position.y
    artilleryCombat.update(0.25, false, new THREE.Vector3(), new THREE.Vector3())
    check(arcProjectile!.position.y > launchHeight, 'Artillery projectile follows a visible ballistic arc before impact')
  } finally {
    artilleryFactory.dispose()
    artilleryCombat.dispose()
  }

  const fuseScene = new THREE.Scene()
  const fuseCombat = new CombatSystem(fuseScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const fuseTarget = new TestTarget('fuse-target', 1.6, 0, 0.32, 'player')
  const fuseFactory = new ExperimentalEnemyFactory(fuseScene, [], fuseCombat, { role: 'host', getTargets: () => [fuseTarget], random: () => 0.5 })
  try {
    const beetle = fuseFactory.create('experimental-scoria-beetle', new THREE.Vector3(0, 0, 0))
    fuseFactory.update(0.01)
    fuseFactory.update(0.4)
    beetle.applyDamage({ sourceId: 'player-test', sourceFaction: 'player', amount: 1_000, type: 'physical' })
    check(fuseFactory.manager.hazards.activeCount === 0, 'Killing the Scoria Beetle before its fuse cancels detonation and zones')
  } finally {
    fuseFactory.dispose()
    fuseCombat.dispose()
  }

  const detonationScene = new THREE.Scene()
  const detonationCombat = new CombatSystem(detonationScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const detonationTarget = new TestTarget('detonation-target', 1.6, 0, 0.32, 'player')
  const detonationFactory = new ExperimentalEnemyFactory(detonationScene, [], detonationCombat, { role: 'host', getTargets: () => [detonationTarget], random: () => 0.5 })
  try {
    detonationFactory.create('experimental-scoria-beetle', new THREE.Vector3(0, 0, 0))
    detonationFactory.update(0.01)
    detonationFactory.update(0.4)
    for (let frame = 0; frame < 44; frame++) detonationFactory.update(0.05)
    check(detonationTarget.health < 100, 'A completed Scoria fuse resolves its explosion as actual gameplay damage')
    check(detonationFactory.manager.hazards.activeCount === 2, 'Confirmed detonation leaves one blast and one configured fire zone')
    detonationFactory.update(0.3)
    check(detonationFactory.manager.hazards.activeCount === 1, 'The blast expires independently while the fire zone remains finite')
  } finally {
    detonationFactory.dispose()
    detonationCombat.dispose()
  }

  const guestScene = new THREE.Scene()
  const guestCombat = new CombatSystem(guestScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const guestFactory = new ExperimentalEnemyFactory(guestScene, [], guestCombat, { role: 'guest', getTargets: () => [target] })
  try {
    let authorityBlocked = false
    try { guestFactory.create(EXPERIMENTAL_ENEMY_DEFINITIONS[0].id, new THREE.Vector3(5, 0, 0)) } catch { authorityBlocked = true }
    check(authorityBlocked, 'Guest/client context cannot create or simulate prototype enemies')
  } finally {
    guestFactory.dispose()
    guestCombat.dispose()
  }
  return `${checks} experimental enemy checks passed`
}

function createProjectileCombat(targets: readonly TestTarget[], obstacles: readonly THREE.Box2[]): CombatSystem {
  const combat = new CombatSystem(new THREE.Scene(), obstacles, REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  for (const target of targets) combat.registerTarget(target)
  return combat
}

function makeProjectile(id: string, damageType: ProjectileDefinition['damageType'], damage: number, onImpact: ProjectileDefinition['onImpact']): ProjectileDefinition {
  return { id, damage, damageType, projectileSpeed: 30, maxRange: 20, projectileRadius: 0.1, onImpact }
}

function fireAndAdvance(combat: CombatSystem, definition: ProjectileDefinition, deltaTime: number): void {
  const source = { id: `test-${definition.id}`, faction: 'players' }
  combat.spawnProjectile(definition, source, new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(1, 0, 0))
  combat.update(deltaTime, false, new THREE.Vector3(), new THREE.Vector3())
}
