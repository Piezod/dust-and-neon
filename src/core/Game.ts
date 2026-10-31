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
import { Wallet } from '../loot/Wallet'
import { LootManager } from '../loot/LootManager'
import { LOOT_TABLES } from '../config/loot.config'
import { WaveManager } from '../waves/WaveManager'
import { WAVE_DEFINITIONS } from '../config/waves.config'

export class Game {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 180)
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  private readonly input = new InputManager()
  private readonly world = new World()
  private readonly player = new Player()
  private readonly combat: CombatSystem
  private readonly enemies: EnemyManager
  private readonly wallet = new Wallet()
  private readonly loot: LootManager
  private readonly waves: WaveManager
  private readonly controller: PlayerController
  private readonly hud: PlayerHUD
  private readonly target = new THREE.Vector3(0, 0, 0)
  private readonly cameraOffset = new THREE.Vector3(26, 34, 32)
  private previousTime = 0
  private elapsedTime = 0
  private running = false

  constructor(container: HTMLElement) {
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2
    this.renderer.domElement.setAttribute('aria-label', 'DUST & NEON: escenario western alienigena en 3D')
    container.append(this.renderer.domElement)
    setupLighting(this.scene)
    this.scene.add(this.world.root, this.player.root)
    this.combat = new CombatSystem(this.scene, this.world.obstacles, REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, () => this.player.stats.isAlive)
    this.combat.registerTarget(this.player)
    this.enemies = new EnemyManager(this.scene, this.world.obstacles, this.combat, this.player, ENEMY_DEFINITIONS)
    this.loot = new LootManager(this.scene, this.world.obstacles, this.enemies, this.player, this.wallet, LOOT_TABLES)
    this.waves = new WaveManager(WAVE_DEFINITIONS, this.enemies)
    this.target.copy(this.player.position)
    this.updateCamera()
    this.resize()
    this.controller = new PlayerController(this.input, this.camera, this.player, this.renderer.domElement, this.world.obstacles)
    this.hud = new PlayerHUD(container, this.player.stats, this.player.abilities, this.enemies, this.wallet, this.loot, this.waves)
    window.addEventListener('resize', this.resize)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.previousTime = performance.now()
    this.renderer.setAnimationLoop(this.tick)
  }

  private readonly tick = (time: number): void => {
    const deltaTime = Math.min(Math.max((time - this.previousTime) / 1000, 0), 0.05)
    this.previousTime = time
    this.elapsedTime += deltaTime
    this.waves.update(deltaTime, this.player.stats.isAlive, this.player.position)
    const acceptsInput = this.player.stats.isAlive && this.waves.acceptsPlayerInput
    this.controller.setGameplayEnabled(acceptsInput)
    if (acceptsInput) {
      this.player.abilities.update(deltaTime)
      this.controller.updateMovement(deltaTime)
    } else {
      this.player.abilities.cancelAll()
      this.controller.cancelAttackInput()
    }
    this.target.lerp(this.player.position, 1 - Math.exp(-6 * deltaTime))
    this.updateCamera()
    if (acceptsInput) this.controller.updateAim()
    if (this.player.stats.isAlive && this.waves.state === 'combat') this.enemies.update(deltaTime)
    if (!this.player.stats.isAlive) {
      this.controller.setGameplayEnabled(false)
      this.player.abilities.cancelAll()
      this.waves.update(0, false, this.player.position)
    }
    this.combat.update(
      deltaTime,
      this.player.stats.isAlive && this.waves.state === 'combat' && this.controller.isFiring,
      this.player.getMuzzlePosition(new THREE.Vector3()),
      this.controller.getAimPoint(new THREE.Vector3()),
      this.waves.state !== 'upgrades' && this.waves.state !== 'completed',
    )
    if (!this.player.stats.isAlive) {
      this.controller.cancelAttackInput()
      this.player.abilities.cancelAll()
    }
    if (this.waves.advancesSimulation) this.loot.update(deltaTime)
    if (this.waves.advancesSimulation) this.world.update(this.elapsedTime)
    this.hud.update()
    this.renderer.render(this.scene, this.camera)
  }

  private updateCamera(): void {
    this.camera.position.copy(this.target).add(this.cameraOffset)
    this.camera.lookAt(this.target)
  }

  private readonly resize = (): void => {
    const width = Math.max(window.innerWidth, 1)
    const height = Math.max(window.innerHeight, 1)
    const aspect = width / height
    const viewHeight = Math.max(34, 45 / aspect)
    this.camera.left = -viewHeight * aspect / 2
    this.camera.right = viewHeight * aspect / 2
    this.camera.top = viewHeight / 2
    this.camera.bottom = -viewHeight / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.setSize(width, height)
  }

  dispose(): void {
    this.running = false
    this.renderer.setAnimationLoop(null)
    window.removeEventListener('resize', this.resize)
    this.hud.destroy()
    this.controller.dispose()
    this.input.dispose()
    this.loot.dispose()
    this.enemies.dispose()
    this.combat.dispose()
    this.player.dispose()
    this.world.dispose()
    this.scene.traverse((object) => {
      if (object instanceof THREE.Light) object.dispose()
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}