import * as THREE from 'three'
import { BossManager } from './BossManager'
import { Boss } from './Boss'
import { CombatSystem } from '../combat/CombatSystem'
import type { Damageable } from '../combat/Damageable'
import { EnemyHazardManager } from '../enemies/EnemyHazardManager'
import { PLAYER_COMBAT_SOURCE, REVOLVER_ATTACK } from '../config/combat.config'
import { BOSS_DEFINITIONS } from '../config/bosses.config'
import { CAMPAIGN_CHAPTERS } from '../config/campaignChapters.config'
import { PLAYER_BASE_STATS } from '../config/player.config'
import { CharacterStats } from '../core/CharacterStats'
import { Wallet } from '../loot/Wallet'
import type { BossAttackContext } from './BossAttackController'
import { BossAttackController } from './BossAttackController'
import { BossPhaseController } from './BossPhaseController'
import type { BossAttackDefinition } from './Boss.types'

export function runBossChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const phaseController = new BossPhaseController([
    { id: 'phase-one', healthBelow: 1, attackIds: ['a'], moveSpeedMultiplier: 1, visualTint: '#fff' },
    { id: 'phase-two', healthBelow: 0.66, attackIds: ['a', 'b'], moveSpeedMultiplier: 1.2, visualTint: '#f80' },
    { id: 'phase-three', healthBelow: 0.33, attackIds: ['b'], moveSpeedMultiplier: 1.4, visualTint: '#f00' },
  ])
  check(phaseController.advance(0.2).map((phase) => phase.id).join(',') === 'phase-two,phase-three', 'A single hit can cross multiple phase thresholds in order')
  check(phaseController.index === 2, 'Phase controller retains the last crossed threshold')
  check(BOSS_DEFINITIONS.length === 6 && CAMPAIGN_CHAPTERS.length === 6 && BOSS_DEFINITIONS.every((boss) => boss.phases.length === 3), 'Six campaign bosses each define three phases')
  check(CAMPAIGN_CHAPTERS.every((chapter) => BOSS_DEFINITIONS.some((boss) => boss.id === chapter.bossId)), 'Every campaign chapter references a configured boss')
  check(BOSS_DEFINITIONS.every((boss) => boss.phases.every((phase) => phase.attackIds.every((id) => boss.attacks.some((attack) => attack.id === id)))), 'Every boss phase references configured attacks')
  check(BOSS_DEFINITIONS.every((boss) => new Set(boss.attacks.map((attack) => attack.pattern)).size >= 4), 'Each boss uses multiple attack patterns')
  check(BOSS_DEFINITIONS.find((boss) => boss.id === 'storm-marshal')?.attacks.some((attack) => attack.pattern === 'arc-nodes' && attack.nodeHealth && attack.telegraph === 'nodes') === true,
    'Storm Marshal configures a telegraphed, destructible arc-link attack')

  for (const definition of BOSS_DEFINITIONS) {
    const hitScene = new THREE.Scene()
    const hitCombat = new CombatSystem(hitScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
    const hitHazards = new EnemyHazardManager(hitScene, [], hitCombat)
    const hitPlayer: Damageable = { combatId: 'boss-hit-player', faction: 'player', getCombatBounds: () => ({ x: 15, z: 15, radius: 0.4 }), applyDamage: () => undefined }
    const boss = new Boss({ definition, position: new THREE.Vector3(5, 0, 0), scene: hitScene, combat: hitCombat, player: hitPlayer, obstacles: [], hazards: hitHazards, summon: () => undefined, onDefeated: () => undefined })
    hitScene.add(boss.root)
    hitCombat.registerTarget(boss)
    try {
      boss.update(1.8)
      const bounds = boss.getCombatBounds()
      check(bounds.footprint?.radiusX === definition.damageHitbox?.radiusX && bounds.footprint?.radiusZ === definition.damageHitbox?.radiusZ, 'Boss exposes configured anatomical damage axes')
      check(boss.getPhysicalBounds().radius === definition.collisionRadius, 'Boss physical radius stays unchanged')
      hitCombat.spawnProjectile({ ...REVOLVER_ATTACK, projectileSpeed: 1000 }, PLAYER_COMBAT_SOURCE, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))
      hitCombat.update(0.01, false, new THREE.Vector3(), new THREE.Vector3(1, 0, 0))
      check(boss.currentHealth === definition.maxHealth - REVOLVER_ATTACK.damage, 'Every boss receives fast swept projectile damage')
      check(boss.getSnapshot().healthRatio === boss.currentHealth / definition.maxHealth, 'Boss main HUD snapshot reflects projectile damage')
      boss.root.position.set(7, 0, 3)
      boss.root.rotation.y = Math.PI / 2
      const moved = boss.getCombatBounds()
      check(moved.x === 7 && moved.z === 3 && moved.footprint?.rotation === Math.PI / 2, 'Boss damage footprint follows movement and orientation')
    } finally {
      boss.dispose()
      hitHazards.clear()
      hitCombat.dispose()
      check(hitScene.children.length === 0, 'Boss hitbox, model, telegraph and projectiles release without floating health meshes')
    }
  }

  const scene = new THREE.Scene()
  const combat = new CombatSystem(scene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  let health = 100
  const player: Damageable = {
    combatId: 'check-player',
    faction: 'player',
    getCombatBounds: () => ({ x: 2, z: 0, radius: 0.4 }),
    applyDamage: (context) => { health = Math.max(0, health - context.amount) },
  }
  const melee = createAttack('check-melee', 'melee', {
    minRange: 0, maxRange: 3, radius: 3, windupSeconds: 0.25, activeSeconds: 0.2,
    recoverySeconds: 0.2, cooldownSeconds: 1, damage: 15,
  })
  const meleeController = new BossAttackController([melee], { id: 'boss-check', faction: 'enemies' }, () => undefined)
  const context = createContext(combat, player, [])
  try {
    meleeController.update(0, ['check-melee'], context)
    check(meleeController.phase === 'windup', 'Boss attack begins with a telegraphed windup')
    meleeController.update(0.25, ['check-melee'], context)
    check(meleeController.phase === 'active' && health === 85, 'Melee damage is applied on active, not windup')
    meleeController.update(0.1, ['check-melee'], context)
    check(health === 85, 'One attack instance applies melee damage only once')
    meleeController.update(0.2, ['check-melee'], context)
    check(meleeController.phase === 'recovery', 'Attack enters recovery after its active window')
    meleeController.update(0.2, ['check-melee'], context)
    check(meleeController.phase === 'cooldown', 'Attack enters cooldown after recovery')
    meleeController.update(0.2, ['check-melee'], context)
    check(meleeController.phase === 'cooldown', 'Cooldown blocks immediate attack reuse')
    meleeController.cancel()
    check(meleeController.phase === null, 'Phase changes can cancel the current attack')

    const blockedController = new BossAttackController([melee], { id: 'boss-blocked', faction: 'enemies' }, () => undefined)
    const wall = new THREE.Box2(new THREE.Vector2(0.9, -1), new THREE.Vector2(1.1, 1))
    blockedController.update(0, ['check-melee'], createContext(combat, player, [wall]))
    check(blockedController.phase === null, 'Line-of-sight blocks attacks through world geometry')
    blockedController.dispose()

    const fan = createAttack('check-fan', 'fan', {
      minRange: 0, maxRange: 10, windupSeconds: 0.1, activeSeconds: 0.3,
      recoverySeconds: 0.1, cooldownSeconds: 1, projectileCount: 5, spreadRadians: 0.8,
      projectile: { id: 'check-bolt', damage: 5, projectileSpeed: 12, maxRange: 20, projectileRadius: 0.1, damageType: 'physical' },
    })
    const fanController = new BossAttackController([fan], { id: 'boss-fan', faction: 'enemies' }, () => undefined)
    fanController.update(0, ['check-fan'], context)
    fanController.update(0.1, ['check-fan'], context)
    check(combat.projectileCount === 5, 'Fan attack emits its configured projectile count')
    fanController.dispose()

    const burst = createAttack('check-burst', 'burst', {
      windupSeconds: 0, activeSeconds: 0.3, burstCount: 3, burstIntervalSeconds: 0.1,
      projectile: { id: 'check-burst-bolt', damage: 5, projectileSpeed: 12, maxRange: 20, projectileRadius: 0.1, damageType: 'physical' },
    })
    const burstController = new BossAttackController([burst], { id: 'boss-burst', faction: 'enemies' }, () => undefined)
    burstController.update(0, ['check-burst'], context)
    burstController.update(0.1, ['check-burst'], context)
    burstController.update(0.1, ['check-burst'], context)
    check(combat.projectileCount === 8, 'Burst attack emits every shot at its configured interval')
    burstController.dispose()
    let rejectsShortBurst = false
    try {
      new BossAttackController([createAttack('invalid-burst', 'burst', { activeSeconds: 0.1, burstCount: 3, burstIntervalSeconds: 0.2 })], { id: 'boss-invalid', faction: 'enemies' }, () => undefined)
    } catch { rejectsShortBurst = true }
    check(rejectsShortBurst, 'Burst definition rejects a phase too short to emit every shot')

    const arc = createAttack('check-arc', 'arc-nodes', {
      activeSeconds: 0.3, recoverySeconds: 0.2, nodeRange: 8, linkWidth: 0.8, nodeHealth: 12, tickIntervalSeconds: 0.25,
      damage: 6, damageType: 'electric', telegraph: 'nodes',
    })
    const arcController = new BossAttackController([arc], { id: 'boss-check-arc', faction: 'enemies' }, () => undefined)
    arcController.update(0, ['check-arc'], context)
    check(context.hazards.activeCount === 1, 'Boss arc pattern creates a single node link on attack activation')
    context.hazards.update(0.31, [player])
    context.hazards.update(0.1, [player])
    check(health < 85, 'Boss arc applies electric damage only after its warning interval')
    context.hazards.removeOwner('boss-check-arc')
    check(context.hazards.activeCount === 0, 'Boss arc owner cleanup removes its nodes and link')
    arcController.dispose()

    const rewardScene = new THREE.Scene()
    const rewardCombat = new CombatSystem(rewardScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
    const rewardHazards = new EnemyHazardManager(rewardScene, [], rewardCombat)
    const rewardStats = new CharacterStats(PLAYER_BASE_STATS)
    rewardStats.takeDamage(40)
    rewardStats.spendEnergy(30)
    const rewardPlayer: Damageable = {
      combatId: 'reward-player', faction: 'player',
      getCombatBounds: () => ({ x: 8, z: 8, radius: 0.4 }),
      applyDamage: () => undefined,
    }
    const rewardEnemies = { aliveCount: 0, trySpawn: () => null, hazards: rewardHazards } as unknown as import('../enemies/EnemyManager').EnemyManager
    const wallet = new Wallet()
    const bossManager = new BossManager(rewardScene, rewardCombat, [], rewardPlayer, rewardStats, rewardEnemies, wallet)
    check(bossManager.start(BOSS_DEFINITIONS[0], new THREE.Vector3(-8, 0, -8)), 'Boss manager starts the configured boss once')
    check(rewardScene.getObjectByName('BossArena') !== undefined, 'Boss start adds its configured arena to the scene')
    check(rewardScene.getObjectByName('Boss:iron-sheriff') !== undefined, 'Boss start adds its model to the render scene')
    bossManager.update(1.8)
    const rewardedBoss = bossManager.currentBoss!
    rewardedBoss.applyDamage({ sourceId: rewardPlayer.combatId, sourceFaction: 'player', amount: BOSS_DEFINITIONS[0].maxHealth, type: 'physical' })
    check(bossManager.isDefeated && wallet.balance === BOSS_DEFINITIONS[0].rewards.gold, 'Boss defeat grants its configured gold reward once')
    rewardedBoss.applyDamage({ sourceId: rewardPlayer.combatId, sourceFaction: 'player', amount: 100, type: 'physical' })
    check(rewardStats.currentHealth === 95 && rewardStats.currentEnergy === 100, 'Boss recovery is applied once and respects resource limits')
    bossManager.update(0.55)
    check(bossManager.currentBoss === null && rewardScene.getObjectByName('BossArena') === undefined && rewardScene.getObjectByName('Boss:iron-sheriff') === undefined, 'Defeated boss and arena are removed after the death animation')
    bossManager.dispose()
    rewardCombat.dispose()

    const navigationScene = new THREE.Scene()
    const navigationCombat = new CombatSystem(navigationScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
    const navigationWall = new THREE.Box2(new THREE.Vector2(-0.5, -2), new THREE.Vector2(0.5, 2))
    const navigationPlayer: Damageable = {
      combatId: 'navigation-player', faction: 'player',
      getCombatBounds: () => ({ x: 4, z: 0, radius: 0.4 }),
      applyDamage: () => undefined,
    }
    const navigationHazards = new EnemyHazardManager(navigationScene, [navigationWall], navigationCombat)
    const navigationEnemies = { aliveCount: 0, trySpawn: () => null, hazards: navigationHazards } as unknown as import('../enemies/EnemyManager').EnemyManager
    const navigationManager = new BossManager(navigationScene, navigationCombat, [navigationWall], navigationPlayer, new CharacterStats(PLAYER_BASE_STATS), navigationEnemies, new Wallet())
    navigationManager.start(BOSS_DEFINITIONS[0], new THREE.Vector3(-4, 0, 0))
    navigationManager.update(1.8)
    let bossStayedClear = true
    for (let frame = 0; frame < 80; frame++) {
      navigationManager.update(0.05)
      const position = navigationManager.currentBoss!.root.position
      const closestX = THREE.MathUtils.clamp(position.x, navigationWall.min.x, navigationWall.max.x)
      const closestZ = THREE.MathUtils.clamp(position.z, navigationWall.min.y, navigationWall.max.y)
      if (Math.hypot(position.x - closestX, position.z - closestZ) < BOSS_DEFINITIONS[0].collisionRadius) bossStayedClear = false
    }
    check(bossStayedClear, 'Boss navigation never penetrates the configured obstacle collider')
    navigationManager.dispose()
    navigationCombat.dispose()
    return `${checks} boss checks passed`
  } finally {
    meleeController.dispose()
    combat.dispose()
  }
}

function createAttack(id: string, pattern: BossAttackDefinition['pattern'], overrides: Partial<BossAttackDefinition> = {}): BossAttackDefinition {
  return {
    id, pattern, phases: ['phase-one'], minRange: 0, maxRange: 10, priority: 1, cooldownSeconds: 1,
    windupSeconds: 0, activeSeconds: 0.1, recoverySeconds: 0.1, damage: 10, damageType: 'physical',
    telegraph: 'line', ...overrides,
  }
}

function createContext(combat: CombatSystem, player: Damageable, obstacles: readonly THREE.Box2[]): BossAttackContext {
  const scene = new THREE.Scene()
  return {
    bossPosition: new THREE.Vector3(0, 0, 0), bossRadius: 0.8, bossSpeed: 2, player, combat, obstacles,
    hazards: new EnemyHazardManager(scene, obstacles, combat),
    summon: () => undefined,
    moveBoss: () => undefined,
    random: () => 0,
  }
}
