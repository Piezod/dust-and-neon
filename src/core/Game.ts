import * as THREE from 'three'
import { InputManager } from './InputManager'
import { PlayerController } from './PlayerController'
import { Player } from '../entities/Player'
import { World } from '../world/World'
import { setupLighting } from '../world/Lighting'
import { PlayerHUD } from '../ui/PlayerHUD'
import { CombatSystem } from '../combat/CombatSystem'
import { PLAYER_COMBAT_SOURCE, REVOLVER_ATTACK } from '../config/combat.config'
import { EnemyManager } from '../enemies/EnemyManager'
import { ENEMY_DEFINITIONS } from '../config/enemies.config'
import { LootManager } from '../loot/LootManager'
import { LOOT_TABLES } from '../config/loot.config'
import { WaveManager } from '../waves/WaveManager'
import { WAVE_DEFINITIONS } from '../config/waves.config'
import { UPGRADE_DEFINITIONS, PERK_DEFINITIONS, PERK_CHOICES_PER_INTERMISSION } from '../config/progression.config'
import { RunState } from '../progression/RunState'
import { IntermissionPanel } from '../ui/IntermissionPanel'
import { TouchControls } from '../ui/TouchControls'
import type { GameSettings } from './GameSettings.types'
import { DEFAULT_GAME_SETTINGS } from './GameSettings.types'
import { GameEventBus, type GameEvent } from '../events/GameEventBus'
import type { GameMode } from '../game-modes/GameMode.types'
import { getGraphicsProfile } from '../config/visualTheme'
import { VisualEffectsSystem } from '../vfx/VisualEffectsSystem'
import { GameDebugVisualization } from './GameDebugVisualization'
import { ENEMY_BALANCE } from '../config/enemyBalance.config'
import { BossManager } from '../bosses/BossManager'
import { BOSS_DEFINITIONS } from '../config/bosses.config'
import { CAMPAIGN_CHAPTERS } from '../config/campaignChapters.config'
import { CampaignManager } from '../game-modes/CampaignManager'
import type { CampaignChapterContent } from '../game-modes/CampaignChapter.types'
import { CampaignHUD } from '../ui/CampaignHUD'
import { PauseOverlay, type PauseReason } from '../ui/PauseOverlay'
import { resolveDifficulty, type DifficultyMultipliers } from '../config/difficulty.config'
import { ArcVoltaicAbility, EmergencyShieldAbility, equipReserveAuxiliary, FrostPulseAbility } from '../abilities/CoopAbilities'
import type { SkillLoadout } from '../abilities/SkillProgressStore'
import { CAMERA_CONFIG, getCameraViewHeight, isTouchDevice } from '../config/camera.config'

export interface GameEndResult {
  readonly kind: 'game-over' | 'mission-complete'
  readonly wave: number
  readonly kills: number
  readonly score: number
}

export interface GameOptions {
  readonly mode?: GameMode
  readonly settings?: GameSettings
  readonly events?: GameEventBus
  readonly onEnd?: (result: GameEndResult) => void
  readonly campaignChapters?: readonly CampaignChapterContent[]
  readonly startChapterIndex?: number
  readonly onChapterComplete?: (chapterId: string) => void
  readonly onExitToMenu?: () => void
  readonly onSettingsChange?: (settings: Partial<GameSettings>) => void
  readonly skillLoadout?: SkillLoadout
}

export class Game {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 180)
  private readonly renderer = new THREE.WebGLRenderer({ antialias: !isTouchDevice(), powerPreference: 'high-performance' })
  private readonly input = new InputManager()
  private readonly world: World
  private readonly player = new Player()
  private readonly combat: CombatSystem
  private readonly enemies: EnemyManager
  private readonly runState: RunState
  private readonly loot: LootManager
  private readonly waves: WaveManager
  private readonly intermission: IntermissionPanel
  private readonly controller: PlayerController
  private readonly hud: PlayerHUD
  private readonly target = new THREE.Vector3(0, 0, 0)
  private readonly cameraFocus = new THREE.Vector3()
  private readonly bossFocusOffset = new THREE.Vector3()
  private readonly movementStart = new THREE.Vector3()
  private readonly cameraOffset = new THREE.Vector3(26, 34, 32)
  private readonly events: GameEventBus
  private readonly visualEffects: VisualEffectsSystem
  private readonly debugVisualization: GameDebugVisualization
  private readonly bossManager: BossManager
  private readonly campaign: CampaignManager | null
  private readonly campaignHUD: CampaignHUD | null
  private pauseOverlay: PauseOverlay | null = null
  private readonly onEnd?: (result: GameEndResult) => void
  private readonly onSettingsChange?: (settings: Partial<GameSettings>) => void
  private readonly passiveSkillModifiers: string[] = []
  private readonly mode: GameMode
  private settings: GameSettings
  private touchControls: TouchControls | null = null
  private unsubscribeEvents: (() => void) | null = null
  private killCount = 0
  private score = 0
  private endNotified = false
  private distanceSinceDust = 0
  private lastDamageSourcePosition: readonly [number, number, number] | undefined
  private previousTime = 0
  private elapsedTime = 0
  private running = false
  private paused = false
  private pauseReason: PauseReason = 'user'
  private orientationPreviousPause: PauseReason | null = null
  private disposed = false
  private activeDifficulty: DifficultyMultipliers
  private pendingDifficulty: DifficultyMultipliers

  constructor(container: HTMLElement, options: GameOptions = {}) {
    this.events = options.events ?? new GameEventBus()
    this.onEnd = options.onEnd
    this.mode = options.mode ?? 'campaign'
    this.settings = options.settings ?? DEFAULT_GAME_SETTINGS
    this.activeDifficulty = resolveDifficulty(this.settings.difficulty, this.settings.customDifficulty)
    this.pendingDifficulty = this.activeDifficulty
    const chapters = this.mode === 'campaign' ? options.campaignChapters ?? CAMPAIGN_CHAPTERS : undefined
    const startChapterIndex = Math.max(0, Math.min(chapters ? chapters.length - 1 : 0, options.startChapterIndex ?? 0))
    this.world = new World(this.settings.graphicsQuality, chapters?.[startChapterIndex]?.worldScenario)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2
    this.renderer.domElement.setAttribute('aria-label', 'DUST & NEON: escenario western alienigena en 3D')
    container.classList.toggle('mobile-layout', isTouchDevice())
    container.append(this.renderer.domElement)
    setupLighting(this.scene, this.settings.graphicsQuality)
    this.scene.add(this.world.root, this.player.root)
    this.visualEffects = new VisualEffectsSystem(this.scene, this.camera, container, this.events, this.settings.graphicsQuality)
    this.combat = new CombatSystem(this.scene, this.world.obstacles, REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, () => this.player.stats.isAlive, this.events)
    this.combat.registerTarget(this.player)
    this.runState = new RunState(this.player.stats, this.combat, UPGRADE_DEFINITIONS, PERK_DEFINITIONS, PERK_CHOICES_PER_INTERMISSION, this.events)
    this.enemies = new EnemyManager(this.scene, this.world.obstacles, this.combat, this.player, ENEMY_DEFINITIONS, this.events, ENEMY_BALANCE.deathAnimationSeconds)
    this.applySkillLoadout(options.skillLoadout)
    this.loot = new LootManager(this.scene, this.world.obstacles, this.enemies, this.player, this.runState.wallet, LOOT_TABLES, Math.random, this.events)
    this.waves = new WaveManager(chapters ? [] : WAVE_DEFINITIONS, this.enemies, { infinite: this.mode === 'infinite', events: this.events, difficulty: this.activeDifficulty })
    this.bossManager = new BossManager(this.scene, this.combat, this.world.obstacles, this.player, this.player.stats, this.enemies, this.runState.wallet, this.events)
    this.campaign = chapters ? new CampaignManager(
      chapters.slice(startChapterIndex),
      BOSS_DEFINITIONS,
      this.world,
      this.waves,
      this.bossManager,
      this.enemies,
      options.onChapterComplete,
      () => {
        this.applyPendingDifficulty()
        return this.activeDifficulty
      },
    ) : null
    this.target.copy(this.player.position)
    this.updateCamera()
    this.resize()
    this.controller = new PlayerController(this.input, this.camera, this.player, this.renderer.domElement, this.world.obstacles, this.events)
    this.setTouchControlsEnabled(this.settings.showTouchControls)
    this.debugVisualization = new GameDebugVisualization(this.scene, this.world, this.enemies, this.player, this.combat, this.events, () => this.bossManager.currentBoss)
    this.hud = new PlayerHUD(container, this.player.stats, this.player.abilities, this.enemies, this.runState.wallet, this.loot, this.waves, {
      setLayer: (layer, visible) => this.debugVisualization.setLayer(layer, visible),
      spawnEffect: () => {
        const position = this.player.position
        this.events.emit({ type: 'debug-effect-requested', position: [position.x + 2, 1.4, position.z + 1.5] })
      },
    })
    this.campaignHUD = this.campaign ? new CampaignHUD(container) : null
    this.intermission = new IntermissionPanel(container, this.waves, this.runState)
    this.onSettingsChange = options.onSettingsChange
    this.pauseOverlay = new PauseOverlay(container, this.settings, {
      onResume: this.resume,
      onExit: options.onExitToMenu ?? (() => undefined),
      onSettings: this.onSettingsChange ?? (() => undefined),
    })
    this.applySettings(this.settings)
    this.applyPendingDifficulty()
    if (this.events) this.unsubscribeEvents = this.events.subscribe(this.onGameEvent)
    window.addEventListener('resize', this.resize)
    window.visualViewport?.addEventListener('resize', this.resize)
    document.addEventListener('fullscreenchange', this.resize)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.updateOrientationPause()
  }

  applySettings(settings: GameSettings): void {
    this.settings = settings
    this.pendingDifficulty = resolveDifficulty(settings.difficulty, settings.customDifficulty)
    this.pauseOverlay?.updateDifficulty(settings)
    this.controller?.setAimSensitivity(settings.aimSensitivity)
    const profile = getGraphicsProfile(settings.graphicsQuality)
    this.renderer.shadowMap.enabled = profile.shadows
    this.renderer.shadowMap.type = settings.graphicsQuality === 'high' ? THREE.VSMShadowMap : THREE.PCFShadowMap
    this.world.setGraphicsQuality(settings.graphicsQuality)
    this.visualEffects.setGraphicsQuality(settings.graphicsQuality)
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.DirectionalLight)) return
      if (object.position.y < 30) return
      object.castShadow = profile.shadows
      const size = Math.max(1, profile.shadowMapSize)
      if (object.shadow.mapSize.x !== size) {
        object.shadow.map?.dispose()
        object.shadow.map = null
        object.shadow.mapSize.set(size, size)
      }
    })
    this.setTouchControlsEnabled(settings.showTouchControls)
    this.touchControls?.applySettings(settings)
    this.resize()
  }

  start(): void {
    if (this.running || this.disposed) return
    this.running = true
    this.previousTime = performance.now()
    this.renderer.setAnimationLoop(this.tick)
  }

  private readonly tick = (time: number): void => {
    const deltaTime = Math.min(Math.max((time - this.previousTime) / 1000, 0), 0.05)
    this.previousTime = time
    if (this.input.consumePressed('Escape')) {
      if (this.paused) this.resume()
      else this.pause('user')
    }
    if (this.paused) {
      this.renderer.render(this.scene, this.camera)
      return
    }
    const healthAtTickStart = this.player.stats.currentHealth
    this.movementStart.copy(this.player.position)
    this.elapsedTime += deltaTime
    const previousWaveState = this.waves.state
    if (!this.campaign || this.campaign.runsWaves) this.waves.update(deltaTime, this.player.stats.isAlive, this.player.position)
    this.campaign?.update(deltaTime, this.player.stats.isAlive)
    if (this.waves.state === 'preparation' && previousWaveState !== 'preparation'
      || previousWaveState === 'preparation' && this.waves.state === 'combat') this.applyPendingDifficulty()
    if (this.waves.state === 'upgrades' && previousWaveState !== 'upgrades') {
      this.runState.beginIntermission(this.waves.getSnapshot().waveNumber)
    } else if (previousWaveState === 'upgrades' && this.waves.state !== 'upgrades') {
      this.runState.endIntermission()
    }
    const acceptsInput = this.player.stats.isAlive && (this.campaign ? this.campaign.acceptsPlayerInput : this.waves.acceptsPlayerInput)
    this.controller.setGameplayEnabled(acceptsInput)
    if (acceptsInput) {
      this.player.abilities.update(deltaTime)
      this.controller.updateMovement(deltaTime)
    } else {
      this.player.abilities.cancelAll()
      this.controller.cancelAttackInput()
    }
    const movementDistance = this.player.position.distanceTo(this.movementStart)
    if (acceptsInput && movementDistance > 0) {
      this.distanceSinceDust += movementDistance
      if (this.distanceSinceDust >= 0.45) {
        this.distanceSinceDust %= 0.45
        this.events.emit({
          type: 'player-moved',
          position: [this.player.position.x, 0.12, this.player.position.z],
          speed: deltaTime > 0 ? movementDistance / deltaTime : 0,
        })
      }
    } else if (!acceptsInput) {
      this.distanceSinceDust = 0
    }
    this.cameraFocus.copy(this.player.position)
    const cameraBoss = this.bossManager.currentBoss
    if (isTouchDevice() && cameraBoss && !cameraBoss.isDefeated) {
      this.bossFocusOffset.subVectors(cameraBoss.root.position, this.player.position).multiplyScalar(CAMERA_CONFIG.bossFocusWeight)
      this.bossFocusOffset.clampLength(0, CAMERA_CONFIG.bossMaximumFocusOffset)
      this.cameraFocus.add(this.bossFocusOffset)
    }
    this.target.lerp(this.cameraFocus, 1 - Math.exp(-6 * deltaTime))
    this.updateCamera(deltaTime)
    if (acceptsInput) this.controller.updateAim()
    if (this.player.stats.isAlive && (this.waves.state === 'combat' || this.campaign?.runsBoss)) this.enemies.update(deltaTime)
    if (!this.player.stats.isAlive) {
      this.runState.endIntermission()
      this.controller.setGameplayEnabled(false)
      this.player.abilities.cancelAll()
      this.waves.update(0, false, this.player.position)
    }
    const shotsBeforeUpdate = this.combat.shotsFired
    const muzzlePosition = this.player.getMuzzlePosition(new THREE.Vector3())
    const aimPosition = this.controller.getAimPoint(new THREE.Vector3())
    const shotDirection = aimPosition.clone().sub(muzzlePosition).setY(0).normalize()
    this.combat.update(
      deltaTime,
      this.player.stats.isAlive && acceptsInput && this.controller.isFiring,
      muzzlePosition,
      aimPosition,
      this.campaign ? this.campaign.runsWaves || this.campaign.runsBoss : this.waves.state !== 'upgrades' && this.waves.state !== 'completed',
    )
    const firedShots = this.combat.shotsFired - shotsBeforeUpdate
    for (let shot = 0; shot < firedShots; shot++) {
      this.events?.emit({
        type: 'player-shot',
        attackId: 'revolver',
        position: [muzzlePosition.x, muzzlePosition.y, muzzlePosition.z],
        direction: [shotDirection.x, shotDirection.y, shotDirection.z],
      })
    }
    const damageTaken = healthAtTickStart - this.player.stats.currentHealth
    if (damageTaken > 0) {
      this.events?.emit({
        type: 'player-damaged',
        amount: damageTaken,
        position: [this.player.position.x, 0.9, this.player.position.z],
        sourcePosition: this.lastDamageSourcePosition,
        lethal: !this.player.stats.isAlive,
      })
      this.lastDamageSourcePosition = undefined
    }
    if (!this.player.stats.isAlive) {
      this.controller.cancelAttackInput()
      this.player.abilities.cancelAll()
    }
    const advancesSimulation = this.campaign ? this.campaign.runsWaves || this.campaign.runsBoss : this.waves.advancesSimulation
    if (advancesSimulation) this.loot.update(deltaTime)
    if (advancesSimulation) this.world.update(this.elapsedTime, deltaTime)
    this.visualEffects.update(deltaTime)
    this.hud.update()
    this.touchControls?.updateAbilities(this.player.abilities.getStates())
    if (this.campaign) this.campaignHUD?.update(this.campaign.getSnapshot())
    this.intermission.update()
    this.debugVisualization.update()
    this.renderer.render(this.scene, this.camera)
    if (this.campaign?.state === 'game-over' || !this.campaign && this.waves.state === 'game-over') this.finishRun('game-over')
    else if (this.campaign?.state === 'victory' || !this.campaign && this.waves.getSnapshot().runComplete) this.finishRun('mission-complete')
  }

  private updateCamera(deltaTime = 0): void {
    this.camera.position.copy(this.target).add(this.cameraOffset)
    this.camera.lookAt(this.target)
    const desiredZoom = isTouchDevice() && this.bossManager.active ? 1 / CAMERA_CONFIG.bossHeightMultiplier : 1
    const zoom = THREE.MathUtils.lerp(this.camera.zoom, desiredZoom, deltaTime > 0 ? 1 - Math.exp(-4 * deltaTime) : 1)
    if (Math.abs(zoom - this.camera.zoom) > 0.00001) {
      this.camera.zoom = zoom
      this.camera.updateProjectionMatrix()
      this.visualEffects?.setWorldToPixelScale(this.renderer.domElement.clientHeight / Math.max(1, this.camera.top - this.camera.bottom) * zoom * this.renderer.getPixelRatio())
    }
  }

  private applyPendingDifficulty(): void {
    this.activeDifficulty = this.pendingDifficulty
    this.waves.setDifficultyContext(this.activeDifficulty)
    this.loot.setResourceRecoveryMultiplier(this.activeDifficulty.resourceRecovery)
  }

  private readonly resize = (): void => {
    const bounds = this.renderer.domElement.parentElement?.getBoundingClientRect()
    const width = Math.max(bounds?.width ?? window.innerWidth, 1)
    const height = Math.max(bounds?.height ?? window.innerHeight, 1)
    const aspect = width / height
    const viewHeight = getCameraViewHeight(width, height, isTouchDevice(), this.settings.mobileZoom)
    this.camera.left = -viewHeight * aspect / 2
    this.camera.right = viewHeight * aspect / 2
    this.camera.top = viewHeight / 2
    this.camera.bottom = -viewHeight / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, getGraphicsProfile(this.settings.graphicsQuality).pixelRatio, isTouchDevice() ? CAMERA_CONFIG.mobilePixelRatio : Infinity))
    this.renderer.setSize(width, height)
    this.visualEffects.setWorldToPixelScale(height / viewHeight * this.camera.zoom * this.renderer.getPixelRatio())
    this.touchControls?.reset()
    this.updateOrientationPause()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.running = false
    this.renderer.setAnimationLoop(null)
    window.removeEventListener('resize', this.resize)
    window.visualViewport?.removeEventListener('resize', this.resize)
    document.removeEventListener('fullscreenchange', this.resize)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.unsubscribeEvents?.()
    this.unsubscribeEvents = null
    this.debugVisualization.dispose()
    this.visualEffects.dispose()
    this.campaign?.dispose()
    this.bossManager.dispose()
    this.campaignHUD?.destroy()
    this.pauseOverlay?.destroy()
    this.pauseOverlay = null
    this.touchControls?.destroy()
    this.touchControls = null
    this.intermission.destroy()
    this.hud.destroy()
    this.controller.dispose()
    this.input.dispose()
    this.loot.dispose()
    this.enemies.dispose()
    this.waves.dispose()
    this.runState.reset()
    for (const modifierId of this.passiveSkillModifiers) this.player.stats.removeModifier(modifierId)
    this.passiveSkillModifiers.length = 0
    this.player.stats.removeModifier('skill.auxiliary-reserve')
    this.combat.dispose()
    this.player.dispose()
    this.world.dispose()
    this.scene.traverse((object) => {
      if (object instanceof THREE.Light) object.dispose()
    })
    this.renderer.dispose()
    this.renderer.domElement.parentElement?.classList.remove('mobile-layout')
    this.renderer.domElement.remove()
  }

  private readonly onVisibilityChange = (): void => {
    if (!document.hidden || this.disposed || this.endNotified) return
    this.input.reset()
    this.touchControls?.reset()
    this.pause('hidden')
  }

  private readonly onBlur = (): void => {
    this.pause('hidden')
  }

  private readonly resume = (): void => {
    if (!this.paused || this.isPortraitTouchViewport()) return
    this.paused = false
    this.controller.setGameplayEnabled(true)
    this.pauseOverlay?.hide()
    this.previousTime = performance.now()
  }

  private pause(reason: PauseReason): void {
    if (this.disposed || this.endNotified) return
    if (this.isPortraitTouchViewport()) reason = 'orientation'
    this.paused = true
    this.pauseReason = reason
    this.controller.setGameplayEnabled(false)
    this.player.abilities.cancelAll()
    this.controller.cancelAttackInput()
    this.touchControls?.reset()
    this.pauseOverlay?.show(reason)
  }

  private updateOrientationPause(): void {
    if (!this.pauseOverlay || this.disposed || this.endNotified) return
    if (this.isPortraitTouchViewport()) {
      if (!this.paused || this.pauseReason !== 'orientation') {
        this.orientationPreviousPause = this.paused ? this.pauseReason : null
        this.pause('orientation')
      }
    } else if (this.paused && this.pauseReason === 'orientation') {
      const previousPause = this.orientationPreviousPause
      this.orientationPreviousPause = null
      if (previousPause) this.pause(previousPause)
      else this.resume()
    }
  }

  private isPortraitTouchViewport(): boolean {
    return isTouchDevice() && window.innerHeight > window.innerWidth
  }

  private readonly onGameEvent = (event: GameEvent): void => {
    if (event.type === 'player-hit-source') {
      this.lastDamageSourcePosition = event.position
    } else if (event.type === 'enemy-killed') {
      this.killCount++
      this.score += 100
    } else if (event.type === 'wave-completed') {
      this.score += event.waveNumber * 250
    } else if (event.type === 'boss-defeated') {
      this.killCount++
      this.score += 1000
    }
  }


  private applySkillLoadout(loadout?: SkillLoadout): void {
    if (!loadout) return
    const context = { player: this.player, enemies: this.enemies, combat: this.combat, obstacles: this.world.obstacles, events: this.events }
    for (const id of loadout.active.slice(0, 2)) {
      if (id === 'arc-voltaic') this.player.abilities.register(new ArcVoltaicAbility(this.player.stats, context))
      else if (id === 'frost-pulse') this.player.abilities.register(new FrostPulseAbility(this.player.stats, context))
      else if (id === 'emergency-shield') {
        this.player.abilities.register(new EmergencyShieldAbility(this.player.stats, (active, capacity) => {
          this.player.setShieldVisual(active, capacity, 42)
          if (active) this.events.emit({ type: 'player-ability-used', abilityId: 'emergency-shield', position: [this.player.position.x, 0.8, this.player.position.z], targets: [], radius: 1.1 })
        }))
      }
    }
    if (loadout.passive.slice(0, 2).includes('auxiliary-reserve')) {
      equipReserveAuxiliary(this.player.stats)
      this.passiveSkillModifiers.push('skill.auxiliary-reserve')
    }
  }

  private finishRun(kind: GameEndResult['kind']): void {
    if (this.endNotified) return
    this.endNotified = true
    const result = {
      kind,
      wave: this.campaign?.getSnapshot().waveNumber ?? this.waves.getSnapshot().waveNumber,
      kills: this.killCount,
      score: this.score,
    } satisfies GameEndResult
    if (kind === 'game-over') this.events?.emit({ type: 'game-over', waveNumber: result.wave, kills: result.kills, score: result.score })
    else this.events?.emit({ type: 'run-completed', waveNumber: result.wave, kills: result.kills, score: result.score })
    this.onEnd?.(result)
  }

  private setTouchControlsEnabled(enabled: boolean): void {
    if (!this.controller || !this.player) return
    if (!enabled) {
      this.touchControls?.destroy()
      this.touchControls = null
      return
    }
    if (this.touchControls) return
    const abilities = this.player.abilities.getStates().map((ability) => ({ id: ability.id, label: ability.inputLabel }))
    this.touchControls = new TouchControls(this.renderer.domElement.parentElement ?? document.body, this.controller, abilities, {
      onPause: () => { if (this.paused) this.resume(); else this.pause('user') },
    })
    this.touchControls.applySettings(this.settings)
  }
}
