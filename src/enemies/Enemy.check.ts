import * as THREE from 'three'
import { CombatSystem } from '../combat/CombatSystem'
import type { CombatSource } from '../combat/Combat.types'
import { REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE } from '../config/combat.config'
import { ENEMY_DEFINITIONS } from '../config/enemies.config'
import { VISUAL_THEME } from '../config/visualTheme'
import { Player } from '../entities/Player'
import { EnemyAttackController } from './EnemyAttackController'
import { EnemyManager } from './EnemyManager'
import { ChaseBehavior } from './ChaseBehavior'
import { KeepDistanceBehavior } from './KeepDistanceBehavior'
import type { EnemyDeathEvent } from './Enemy.types'

export function runEnemyChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const close = (actual: number, expected: number, label: string, tolerance = 1e-8): void => {
    check(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, label)
  }
  const crawlerDefinition = ENEMY_DEFINITIONS.find((definition) => definition.id === 'alien-crawler')!
  const outlawDefinition = ENEMY_DEFINITIONS.find((definition) => definition.id === 'mechanical-outlaw')!
  check(Object.isFrozen(crawlerDefinition) && Object.isFrozen(crawlerDefinition.attacks), 'Enemy definition and attacks are immutable')

  const scene = new THREE.Scene()
  const player = new Player()
  scene.add(player.root)
  const combat = new CombatSystem(scene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  combat.registerTarget(player)
  const manager = new EnemyManager(scene, [], combat, player, ENEMY_DEFINITIONS)
  const deathEvents: EnemyDeathEvent[] = []
  manager.onDeath((event) => deathEvents.push(event))
  try {
    const crawlerA = manager.spawn(crawlerDefinition.id, new THREE.Vector3(10, 0, 3))
    const crawlerB = manager.spawn(crawlerDefinition.id, new THREE.Vector3(13, 0, 3))
    check(manager.aliveCount === 2 && crawlerA.combatId !== crawlerB.combatId, 'Manager creates unique instances from one definition')
    close(crawlerA.currentHealth, 45, 'First crawler starts with configured health')
    crawlerA.applyDamage({ sourceId: player.combatId, sourceFaction: player.faction, amount: 10, type: 'physical' })
    const crawlerBoundsAfterHit = crawlerA.getCombatBounds()
    close(crawlerA.currentHealth, 35, 'Damage changes only the hit crawler')
    close(crawlerB.currentHealth, 45, 'Sibling crawler keeps independent health')
    check(crawlerBoundsAfterHit.x === crawlerA.root.position.x && crawlerBoundsAfterHit.z === crawlerA.root.position.z, 'Hit feedback leaves the collision root unchanged')
    crawlerA.root.position.set(4, 0, player.position.z)
    const healthBeforeBullet = crawlerA.currentHealth
    combat.spawnProjectile(REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, new THREE.Vector3(10, 1, player.position.z), new THREE.Vector3(-1, 0, 0))
    combat.update(0.3, false, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))
    close(crawlerA.currentHealth, healthBeforeBullet - 15, 'Revolver projectile damages registered enemy through swept collision')
    check(combat.projectileCount === 0, 'Revolver projectile is removed after hitting enemy')

    const crawlerStart = crawlerB.root.position.clone()
    manager.update(0.25)
    check(crawlerB.state === 'pursuing', 'Crawler detects and enters pursuit state')
    check(crawlerB.root.position.distanceTo(crawlerStart) > 0, 'Chase behavior moves toward player')
    const undetectedStart = crawlerB.root.position.clone()
    crawlerB.root.position.set(player.position.x + crawlerDefinition.detectionRange + 2, 0, player.position.z)
    manager.update(0.25)
    check(crawlerB.state === 'idle', 'Enemy outside detection range stays idle')
    close(crawlerB.root.position.distanceTo(new THREE.Vector3(player.position.x + crawlerDefinition.detectionRange + 2, 0, player.position.z)), 0, 'Undetected enemy does not move')
    crawlerB.root.position.copy(undetectedStart)

    const crawlerSource: CombatSource = { id: 'enemy.crawler.check', faction: 'enemies' }
    const meleePhases: string[] = []
    const melee = new EnemyAttackController(crawlerDefinition.attacks, crawlerSource, combat, (_attackId, phase) => {
      meleePhases.push(phase ?? 'idle')
    })
    const origin = new THREE.Vector3(player.position.x + 1, 1, player.position.z)
    const playerHealth = player.stats.currentHealth
    check(melee.selectAttack(1)?.id === 'claw', 'Melee attack is selected inside its range')
    check(melee.selectAttack(1.6) === null, 'Attack is rejected outside configured range')
    check(melee.update(0, true, 1, origin, player.position, player) === 'claw', 'Selected melee attack begins its telegraph')
    check(melee.getPhaseState()?.phase === 'windup', 'Melee begins in windup phase')
    close(player.stats.currentHealth, playerHealth, 'Windup does not apply melee damage')
    melee.update(crawlerDefinition.attacks[0].windupSeconds!, true, 1, origin, player.position, player)
    check(melee.getPhaseState()?.phase === 'active', 'Melee transitions to its active hit phase')
    close(player.stats.currentHealth, playerHealth - 10, 'Melee damage occurs on active phase only')
    melee.update(crawlerDefinition.attacks[0].activeSeconds!, true, 1, origin, player.position, player)
    check(melee.getPhaseState()?.phase === 'recovery', 'Melee enters recovery after one hit')
    close(player.stats.currentHealth, playerHealth - 10, 'Active duration does not repeat melee damage')
    melee.update(crawlerDefinition.attacks[0].recoverySeconds!, true, 1, origin, player.position, player)
    check(melee.getPhaseState()?.phase === 'cooldown', 'Melee recovery transitions to cooldown')
    check(meleePhases.slice(0, 4).join(',') === 'windup,active,recovery,cooldown', 'Melee emits the configured phase sequence')
    close(melee.getCooldownRemaining('claw'), 1.5, 'Melee cooldown begins after recovery')
    check(melee.update(0.5, true, 1, origin, player.position, player) === null, 'Melee cooldown prevents a new telegraph')
    close(player.stats.currentHealth, playerHealth - 10, 'Cooldown rejection causes no extra damage')
    melee.update(1, true, 1, origin, player.position, player)
    check(melee.getPhaseState()?.phase === 'windup', 'Melee can telegraph again after cooldown')

    const keepDistance = new KeepDistanceBehavior(7, 0.4)
    const desired = new THREE.Vector3()
    keepDistance.getDirection(new THREE.Vector3(8, 0, 3), new THREE.Vector3(1, 0, 3), desired)
    close(desired.length(), 0, 'Keep-distance behavior holds preferred range')
    keepDistance.getDirection(new THREE.Vector3(10, 0, 3), new THREE.Vector3(1, 0, 3), desired)
    check(desired.x < 0, 'Keep-distance behavior approaches when target is too far')
    keepDistance.getDirection(new THREE.Vector3(3, 0, 3), new THREE.Vector3(1, 0, 3), desired)
    check(desired.x > 0, 'Keep-distance behavior retreats when target is too close')
    const outlawSource: CombatSource = { id: 'enemy.outlaw.check', faction: 'enemies' }
    const outlawAttacks = new EnemyAttackController(outlawDefinition.attacks, outlawSource, combat)
    check(outlawAttacks.selectAttack(1.2)?.id === 'close-strike', 'Outlaw prioritizes the close strike at short range')
    check(outlawAttacks.selectAttack(7)?.id === 'plasma-shot', 'Outlaw selects plasma at preferred range')
    check(outlawAttacks.selectAttack(13) === null, 'Outlaw selects no attack beyond maximum range')
    const tieBreak = new EnemyAttackController([
      { ...outlawDefinition.attacks[0], id: 'z-attack', priority: 3 },
      { ...outlawDefinition.attacks[0], id: 'a-attack', priority: 3 },
    ], outlawSource, combat)
    check(tieBreak.selectAttack(7)?.id === 'a-attack', 'Equal-priority attacks use a deterministic ID tie-break')

    const plasma = outlawDefinition.attacks.find((attack) => attack.id === 'plasma-shot')!
    const plasmaOrigin = new THREE.Vector3(player.position.x + 9, 1.2, player.position.z)
    const plasmaPlayerHealth = player.stats.currentHealth
    check(outlawAttacks.update(0, true, 9, plasmaOrigin, player.position, player) === 'plasma-shot', 'Outlaw starts its plasma windup')
    check(outlawAttacks.getPhaseState()?.phase === 'windup' && combat.projectileCount === 0, 'Plasma windup does not spawn projectiles early')
    close(player.stats.currentHealth, plasmaPlayerHealth, 'Plasma windup does not cause damage')
    outlawAttacks.update(plasma.windupSeconds!, true, 9, plasmaOrigin, player.position, player)
    check(outlawAttacks.getPhaseState()?.phase === 'active' && combat.projectileCount === 1, 'Plasma active phase fires the first configured shot')
    outlawAttacks.update(plasma.burstIntervalSeconds! - 0.01, true, 9, plasmaOrigin, player.position, player)
    check(combat.projectileCount === 1, 'Burst interval delays the next plasma shot')
    outlawAttacks.update(0.01, true, 9, plasmaOrigin, player.position, player)
    check(combat.projectileCount === 2, 'Second plasma shot follows its configured interval')
    outlawAttacks.update(plasma.burstIntervalSeconds!, true, 9, plasmaOrigin, player.position, player)
    check(combat.projectileCount === 3, 'Configured plasma burst contains three shots')
    outlawAttacks.update(plasma.activeSeconds!, true, 9, plasmaOrigin, player.position, player)
    check(outlawAttacks.getPhaseState()?.phase === 'recovery', 'Plasma burst enters recovery after its active window')
    outlawAttacks.update(plasma.recoverySeconds!, true, 9, plasmaOrigin, player.position, player)
    check(outlawAttacks.getPhaseState()?.phase === 'cooldown', 'Plasma recovery starts its cooldown')
    check(outlawAttacks.update(1.9, true, 9, plasmaOrigin, player.position, player) === null, 'Plasma cooldown blocks premature re-use')
    check(outlawAttacks.update(0.1, true, 9, plasmaOrigin, player.position, player) === 'plasma-shot', 'Plasma can telegraph again when cooldown expires')
    const plasmaMesh = scene.getObjectByName('Projectile:enemy.plasma') as THREE.Mesh | null
    check(plasmaMesh !== null, 'Enemy plasma reuses CombatSystem projectile creation')
    check((plasmaMesh!.material as THREE.MeshStandardMaterial).color.getHexString() === VISUAL_THEME.colors.plasmaCore.slice(1), 'Plasma uses its centralized projectile color')
    combat.update(1, false, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))
    close(player.stats.currentHealth, plasmaPlayerHealth - plasma.damage * 3, 'Plasma burst projectiles apply configured damage to Player')
    check(combat.projectileCount === 0, 'Plasma projectile is removed after impact')

    const blocker = new THREE.Box2(new THREE.Vector2(4, -1), new THREE.Vector2(5, 1))
    const blockedScene = new THREE.Scene()
    const blockedPlayer = new Player()
    blockedScene.add(blockedPlayer.root)
    const blockedCombat = new CombatSystem(blockedScene, [blocker], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
    blockedCombat.registerTarget(blockedPlayer)
    const blockedManager = new EnemyManager(blockedScene, [blocker], blockedCombat, blockedPlayer, ENEMY_DEFINITIONS)
    const blockedEnemy = blockedManager.spawn(crawlerDefinition.id, new THREE.Vector3(8, 0, 0), 0)
    const blockedStart = blockedEnemy.root.position.clone()
    let remainedOutside = true
    for (let frame = 0; frame < 20; frame++) {
      blockedManager.update(0.2)
      const closestX = THREE.MathUtils.clamp(blockedEnemy.root.position.x, blocker.min.x, blocker.max.x)
      const closestZ = THREE.MathUtils.clamp(blockedEnemy.root.position.z, blocker.min.y, blocker.max.y)
      if (Math.hypot(blockedEnemy.root.position.x - closestX, blockedEnemy.root.position.z - closestZ) < blockedEnemy.definition.collisionRadius) remainedOutside = false
    }
    check(remainedOutside, 'Enemy never penetrates an obstacle while moving around it')
    check(blockedEnemy.root.position.distanceTo(blockedStart) > 0, 'Local steering can move along or around an obstacle')
    blockedManager.dispose()
    blockedCombat.dispose()
    blockedPlayer.dispose()

    const frameSmall = manager.spawn(crawlerDefinition.id, new THREE.Vector3(18, 0, 12))
    const frameLarge = manager.spawn(crawlerDefinition.id, new THREE.Vector3(20, 0, 12))
    const smallStart = frameSmall.root.position.clone()
    const largeStart = frameLarge.root.position.clone()
    for (let frame = 0; frame < 10; frame++) frameSmall.update(0.02, player, [])
    frameLarge.update(0.2, player, [])
    close(frameSmall.root.position.distanceTo(smallStart), frameLarge.root.position.distanceTo(largeStart), 'Enemy movement is consistent across deltaTime sizes', 0.03)

    const deathTarget = manager.spawn(crawlerDefinition.id, new THREE.Vector3(25, 0, 12))
    const deathId = deathTarget.combatId
    const deathBounds = deathTarget.getCombatBounds()
    deathTarget.applyDamage({ sourceId: 'player', sourceFaction: 'player', amount: 45, type: 'physical' })
    check(deathTarget.isDead && deathTarget.state === 'dead', 'Enemy reaches dead state at zero health')
    check(manager.getAlive().every((enemy) => enemy.combatId !== deathId), 'Dead enemy is removed from manager immediately')
    check(scene.children.includes(deathTarget.root) && manager.dyingCount === 1, 'Dead enemy is excluded from combat while its death animation remains visible')
    check(deathEvents.at(-1)?.enemyId === deathId && deathEvents.at(-1)?.lootTableId === crawlerDefinition.lootTableId, 'Death event contains identity and future loot table reference')
    const eventCount = deathEvents.length
    deathTarget.applyDamage({ sourceId: 'player', sourceFaction: 'player', amount: 45, type: 'physical' })
    check(deathEvents.length === eventCount, 'Death event is emitted only once')
    const healthAfterDeath = player.stats.currentHealth
    deathTarget.update(1, player, [])
    close(player.stats.currentHealth, healthAfterDeath, 'Dead enemy cannot attack during its death animation')
    manager.update(0.2)
    const animatedBounds = deathTarget.getCombatBounds()
    check(animatedBounds.x === deathBounds.x && animatedBounds.z === deathBounds.z && animatedBounds.radius === deathBounds.radius, 'Death animation never changes enemy collider bounds')
    manager.update(0.2)
    check(manager.dyingCount === 0 && !scene.children.includes(deathTarget.root), 'Dead visual releases after its animation duration')

    const healthBeforeFriendly = player.stats.currentHealth
    player.applyDamage({ sourceId: 'enemy.friendly', sourceFaction: 'player', amount: 50, type: 'physical' })
    close(player.stats.currentHealth, healthBeforeFriendly, 'Player rejects damage from its own faction')
  } finally {
    manager.dispose()
    combat.dispose()
    player.dispose()
  }

  const chase = new ChaseBehavior(1.25)
  const chaseDirection = chase.getDirection(new THREE.Vector3(10, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3())
  check(chaseDirection.x < 0 && Math.abs(chaseDirection.length() - 1) < 1e-8, 'Chase direction is normalized toward the player')
  return `${checks} enemy checks passed`
}