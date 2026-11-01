import { AchievementManager, type AchievementState } from '../achievements/AchievementManager'
import { AudioManager } from '../audio/AudioManager'
import { CAMPAIGN_DEFINITION } from '../config/campaign.config'
import { CAMPAIGN_CHAPTERS } from '../config/campaignChapters.config'
import type { Game, GameEndResult } from '../core/Game'
import type { GameMode } from '../game-modes/GameMode.types'
import { CampaignProgress } from '../game-modes/CampaignProgress'
import { InfiniteRunRecordStore } from '../game-modes/InfiniteRunRecord'
import { GameEventBus } from '../events/GameEventBus'
import { SettingsStore } from './SettingsStore'
import { MenuView, type MenuScreen } from '../ui/menu/MenuView'
import { MultiplayerLobbyView } from '../multiplayer/MultiplayerLobbyView'
import type { MultiplayerClient } from '../multiplayer/MultiplayerClient'
import { SkillProgressStore } from '../abilities/SkillProgressStore'
import { SkillLoadoutView } from '../ui/SkillLoadoutView'
import type { SkillLoadout } from '../abilities/SkillProgressStore'
import { DIFFICULTY_PROFILES } from '../config/difficulty.config'

interface ActiveRun {
  readonly mode: GameMode
  readonly missionId?: string
}

export class ApplicationController {
  private readonly container: HTMLElement
  private readonly events = new GameEventBus()
  private readonly settings = new SettingsStore()
  private readonly campaignProgress = new CampaignProgress(CAMPAIGN_DEFINITION)
  private readonly skillProgress = new SkillProgressStore(undefined, CAMPAIGN_CHAPTERS.filter((chapter) => this.campaignProgress.isCompleted(chapter.id)).map((chapter) => chapter.id))
  private readonly record = new InfiniteRunRecordStore()
  private readonly achievements = new AchievementManager(this.events)
  private readonly audio = new AudioManager(this.settings, this.events)
  private readonly menu: MenuView
  private readonly unsubscribeAchievements: () => void
  private readonly unsubscribeSettings: () => void
  private game: Game | null = null
  private gameHost: HTMLDivElement | null = null
  private activeRun: ActiveRun = { mode: 'campaign', missionId: CAMPAIGN_CHAPTERS[0].id }
  private currentScreen: MenuScreen = 'home'
  private screenBeforeUtility: MenuScreen = 'home'
  private destroyed = false
  private runGeneration = 0
  private toastTimer: number | null = null
  private multiplayerView: MultiplayerLobbyView | null = null
  private multiplayerClient: MultiplayerClient | null = null
  private unsubscribeMultiplayer: (() => void) | null = null
  private multiplayerStartGeneration = 0
  private skillView: SkillLoadoutView | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.menu = new MenuView(container, {
      onGesture: this.onGesture,
      onCampaign: this.showCampaign,
      onMultiplayer: this.showMultiplayer,
      onInfinite: () => this.startRun({ mode: 'infinite' }),
      onMission: (missionId) => this.startRun({ mode: 'campaign', missionId }),
      onOpenSettings: this.showSettings,
      onSkills: this.showSkills,
      onOpenAchievements: this.showAchievements,
      onBack: this.goBack,
      onRetry: () => this.startRun(this.activeRun),
      onMainMenu: this.returnToMainMenu,
      onSettings: (changes) => this.settings.update(changes),
    })
    this.unsubscribeAchievements = this.achievements.subscribe(this.onAchievementUnlocked)
    this.unsubscribeSettings = this.settings.subscribe((value) => this.game?.applySettings(value))
    this.renderHome()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.runGeneration++
    this.unsubscribeAchievements()
    this.unsubscribeSettings()
    this.unsubscribeMultiplayer?.()
    this.multiplayerClient?.dispose()
    this.multiplayerView?.destroy()
    this.achievements.dispose()
    this.audio.dispose()
    this.game?.dispose()
    this.game = null
    this.gameHost?.remove()
    this.gameHost = null
    this.menu.destroy()
    this.skillView?.destroy()
    this.events.clear()
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer)
  }

  private readonly onGesture = (): void => {
    this.events.emit({ type: 'menu-action', action: this.currentScreen })
    void this.audio.unlock()
  }

  private readonly showCampaign = (): void => {
    this.currentScreen = 'campaign'
    this.menu.showCampaign(
      CAMPAIGN_DEFINITION,
      (id) => this.campaignProgress.isUnlocked(id),
      (id) => this.campaignProgress.isCompleted(id),
      this.getDifficultyLabel(),
    )
  }

  private readonly showMultiplayer = (): void => {
    this.disposeGame()
    this.multiplayerView?.destroy()
    this.multiplayerView = new MultiplayerLobbyView(this.container, {
      onCreate: (name) => { void this.connectMultiplayer('create', name) },
      onJoin: (code, name) => { void this.connectMultiplayer('join', name, code) },
      onStart: () => {
        try { this.multiplayerClient?.startGame() } catch (error) { this.multiplayerView?.setBusy(false, this.getErrorMessage(error)) }
      },
      onReturnToMenu: this.exitMultiplayer,
      onReturnToLobby: () => {
        this.disposeGame()
        if (this.multiplayerClient?.role === 'host') this.multiplayerClient.resetToLobby()
        const client = this.multiplayerClient
        if (client?.roomCode && client.role) this.multiplayerView?.showLobby(client.roomCode, client.role, client.update)
      },
    })
    this.menu.root.hidden = true
    this.currentScreen = 'multiplayer'
  }

  private readonly exitMultiplayer = (): void => {
    this.multiplayerStartGeneration++
    this.disposeGame()
    this.unsubscribeMultiplayer?.()
    this.unsubscribeMultiplayer = null
    this.multiplayerClient?.leaveRoom()
    this.multiplayerClient?.dispose()
    this.multiplayerClient = null
    this.multiplayerView?.destroy()
    this.multiplayerView = null
    this.renderHome()
  }

  private async connectMultiplayer(action: 'create' | 'join', name: string, roomCode = ''): Promise<void> {
    if (!this.multiplayerView || this.multiplayerClient) return
    this.multiplayerView.setBusy(true, 'Contactando al servidor de salas...')
    try {
      const { MultiplayerClient } = await import('../multiplayer/MultiplayerClient')
      if (!this.multiplayerView || this.destroyed) return
      const client = new MultiplayerClient()
      this.multiplayerClient = client
      this.unsubscribeMultiplayer = client.subscribe((update) => {
        if (this.multiplayerClient !== client || !this.multiplayerView) return
        this.multiplayerView.update(update)
        if (client.roomCode && client.role && (update.state === 'lobby' || update.state === 'playing' || update.state === 'ended')) {
          this.multiplayerView.showLobby(client.roomCode, client.role, update)
        }
        if (update.state === 'playing' && !this.game) void this.startMultiplayerGame(client)
      })
      if (action === 'create') await client.createRoom(name)
      else await client.joinRoom(roomCode, name)
      this.multiplayerView?.setBusy(false)
    } catch (error) {
      this.unsubscribeMultiplayer?.()
      this.unsubscribeMultiplayer = null
      this.multiplayerClient?.dispose()
      this.multiplayerClient = null
      this.multiplayerView?.setBusy(false, this.getErrorMessage(error))
    }
  }

  private startMultiplayerGame(client: MultiplayerClient): void {
    this.multiplayerView?.setLobbyMessage(client.role === 'host'
      ? 'Sala conectada. La simulacion cooperativa aun no esta integrada; no se ha iniciado una partida jugable.'
      : 'Sesion recibida. La simulacion cooperativa aun no esta integrada en este cliente.')
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'La operacion no se pudo completar.'
  }

  private readonly showSettings = (): void => {
    this.screenBeforeUtility = this.currentScreen
    this.currentScreen = 'settings'
    this.menu.showSettings(this.settings.settings)
  }

  private readonly showAchievements = (): void => {
    this.screenBeforeUtility = this.currentScreen
    this.currentScreen = 'achievements'
    this.menu.showAchievements(this.achievements.getStates())
  }

  private readonly showSkills = (): void => {
    this.skillView?.destroy()
    this.menu.root.hidden = true
    this.currentScreen = 'skills'
    this.skillView = new SkillLoadoutView(this.container, this.skillProgress, () => {
      this.skillView?.destroy()
      this.skillView = null
      this.renderHome()
    })
  }

  private readonly goBack = (): void => {
    if (this.currentScreen === 'settings' || this.currentScreen === 'achievements') {
      if (this.screenBeforeUtility === 'campaign') this.showCampaign()
      else this.renderHome()
      return
    }
    this.renderHome()
  }

  private readonly returnToMainMenu = (): void => {
    this.runGeneration++
    this.disposeGame()
    this.renderHome()
  }

  private renderHome(): void {
    this.currentScreen = 'home'
    this.audio.setMusicTrack('menu')
    this.menu.root.hidden = false
    this.menu.showHome(this.record.record, this.getDifficultyLabel())
  }

  private getDifficultyLabel(): string {
    const id = this.settings.settings.difficulty
    return id === 'custom' ? 'PERSONALIZADA' : DIFFICULTY_PROFILES.find((profile) => profile.id === id)?.label ?? 'Normal'
  }

  private async startRun(run: ActiveRun): Promise<void> {
    const generation = ++this.runGeneration
    this.disposeGame()
    this.activeRun = run
    this.currentScreen = 'game-over'
    this.menu.root.hidden = true
    const host = document.createElement('div')
    host.className = 'game-stage'
    this.container.append(host)
    this.gameHost = host
    try {
      const { Game } = await import('../core/Game')
      if (this.destroyed || generation !== this.runGeneration) {
        host.remove()
        return
      }
      this.game = new Game(host, {
        mode: run.mode,
        settings: this.settings.settings,
        events: this.events,
        onExitToMenu: this.returnToMainMenu,
        onSettingsChange: (changes) => this.settings.update(changes),
        onEnd: (result) => this.onRunEnded(run, result),
        ...(run.mode === 'campaign' ? {
          campaignChapters: CAMPAIGN_CHAPTERS,
          startChapterIndex: Math.max(0, CAMPAIGN_CHAPTERS.findIndex((chapter) => chapter.id === run.missionId)),
          onChapterComplete: (chapterId: string) => {
            this.campaignProgress.completeMission(chapterId)
            this.skillProgress.unlockForChapter(chapterId)
          },
        } : {}),
        skillLoadout: this.skillProgress.getSnapshot().loadout satisfies SkillLoadout,
      })
      this.game.start()
    } catch (error) {
      if (this.destroyed || generation !== this.runGeneration) {
        host.remove()
        return
      }
      console.error(error)
      this.disposeGame()
      this.renderHome()
      const message = document.createElement('p')
      message.className = 'error'
      message.textContent = 'No se pudo iniciar el escenario 3D. Comprueba que WebGL este disponible.'
      this.container.append(message)
      window.setTimeout(() => message.remove(), 5000)
    }
  }

  private readonly onRunEnded = (run: ActiveRun, result: GameEndResult): void => {
    if (this.destroyed) return
    if (run.mode === 'infinite') this.record.update(result.wave, result.score)
    this.disposeGame()
    this.menu.root.hidden = false
    this.currentScreen = result.kind
    this.menu.showEndScreen(result.kind, result)
  }

  private readonly onAchievementUnlocked = (achievement: AchievementState): void => {
    this.events.emit({ type: 'achievement-unlocked', achievementId: achievement.id })
    if (!this.gameHost) {
      this.menu.notifyAchievement(achievement)
      return
    }
    const toast = document.createElement('div')
    toast.className = 'achievement-toast app-achievement-toast'
    toast.setAttribute('role', 'status')
    toast.innerHTML = `<strong>LOGRO DESBLOQUEADO</strong><span>${achievement.title}</span>`
    this.container.append(toast)
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => {
      toast.remove()
      this.toastTimer = null
    }, 3500)
  }

  private disposeGame(): void {
    this.game?.dispose()
    this.game = null
    this.gameHost?.remove()
    this.gameHost = null
  }
}
