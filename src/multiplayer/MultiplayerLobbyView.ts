import type { MultiplayerClientUpdate } from './MultiplayerClient'
import type { NetworkGameResult, NetworkRole } from './protocol'
import './multiplayer.css'

export interface MultiplayerLobbyActions {
  readonly onCreate: (displayName: string) => void
  readonly onJoin: (roomCode: string, displayName: string) => void
  readonly onStart: () => void
  readonly onReturnToMenu: () => void
  readonly onReturnToLobby: () => void
}

export class MultiplayerLobbyView {
  readonly root = document.createElement('main')
  private readonly actions: MultiplayerLobbyActions
  private readonly listeners = new AbortController()
  private readonly homePanel: HTMLElement
  private readonly lobbyPanel: HTMLElement
  private readonly resultPanel: HTMLElement
  private readonly nameInput: HTMLInputElement
  private readonly codeInput: HTMLInputElement
  private readonly status: HTMLElement
  private readonly roster: HTMLElement
  private readonly roomCode: HTMLElement
  private readonly startButton: HTMLButtonElement
  private currentRole: NetworkRole | null = null

  constructor(container: HTMLElement, actions: MultiplayerLobbyActions) {
    this.actions = actions
    this.root.className = 'multiplayer-screen'
    this.root.innerHTML = `
      <div class="multiplayer-screen__backdrop" aria-hidden="true"></div>
      <div class="multiplayer-screen__content">
        <header class="multiplayer-screen__header">
          <span class="menu-eyebrow">LAST LIGHT OUTPOST · EXPERIMENTAL</span>
          <h1>MULTIJUGADOR</h1>
          <p>Cooperativo online para dos. Sesion privada y autoridad del anfitrion.</p>
        </header>
        <section class="multiplayer-panel multiplayer-panel--home" data-panel="home">
          <label class="multiplayer-field"><span>Nombre de jugador</span><input data-field="name" maxlength="20" autocomplete="nickname" value="Dust Rider" /></label>
          <button class="multiplayer-action multiplayer-action--primary" data-action="create">CREAR SALA PRIVADA</button>
          <div class="multiplayer-divider"><span>O UNIRSE</span></div>
          <label class="multiplayer-field"><span>Codigo de sala</span><input data-field="code" maxlength="12" autocomplete="off" placeholder="12 CARACTERES" /></label>
          <button class="multiplayer-action" data-action="join">UNIRSE A SALA</button>
          <p class="multiplayer-status" data-value="home-status" role="status" aria-live="polite"></p>
          <p class="multiplayer-note">Experimental. Sin reconexion a partidas iniciadas ni proteccion antitrampas.</p>
        </section>
        <section class="multiplayer-panel multiplayer-panel--lobby" data-panel="lobby" hidden>
          <div class="multiplayer-room-code"><span>CODIGO PRIVADO</span><strong data-value="room-code"></strong><button class="multiplayer-copy" data-action="copy" aria-label="Copiar codigo" title="Copiar codigo">COPIAR</button></div>
          <ol class="multiplayer-roster" data-value="roster"></ol>
          <p class="multiplayer-status" data-value="status" role="status" aria-live="polite"></p>
          <button class="multiplayer-action multiplayer-action--primary" data-action="start">INICIAR PARTIDA</button>
          <p class="multiplayer-note" data-value="start-note">El anfitrion puede empezar solo; el segundo jugador puede entrar mientras esta sala siga abierta.</p>
        </section>
        <section class="multiplayer-panel multiplayer-panel--result" data-panel="result" hidden>
          <span class="menu-eyebrow">SUPERVIVENCIA TERMINADA</span>
          <h2>RESULTADO DE LA SALA</h2>
          <dl class="multiplayer-result" data-value="result"></dl>
          <button class="multiplayer-action multiplayer-action--primary" data-action="lobby">VOLVER AL LOBBY</button>
        </section>
        <footer class="multiplayer-screen__footer"><span data-value="connection">DESCONECTADO</span><button class="multiplayer-back" data-action="menu">VOLVER AL MENU</button></footer>
      </div>
    `
    container.append(this.root)
    this.homePanel = this.root.querySelector<HTMLElement>('[data-panel="home"]')!
    this.lobbyPanel = this.root.querySelector<HTMLElement>('[data-panel="lobby"]')!
    this.resultPanel = this.root.querySelector<HTMLElement>('[data-panel="result"]')!
    this.nameInput = this.root.querySelector<HTMLInputElement>('[data-field="name"]')!
    this.codeInput = this.root.querySelector<HTMLInputElement>('[data-field="code"]')!
    this.status = this.root.querySelector<HTMLElement>('[data-value="status"]')!
    this.roster = this.root.querySelector<HTMLElement>('[data-value="roster"]')!
    this.roomCode = this.root.querySelector<HTMLElement>('[data-value="room-code"]')!
    this.startButton = this.root.querySelector<HTMLButtonElement>('[data-action="start"]')!
    this.root.addEventListener('click', this.onClick, { signal: this.listeners.signal })
    this.root.addEventListener('input', this.onInput, { signal: this.listeners.signal })
  }

  showLobby(roomCode: string, role: NetworkRole, update: MultiplayerClientUpdate): void {
    this.currentRole = role
    this.homePanel.hidden = true
    this.resultPanel.hidden = true
    this.lobbyPanel.hidden = false
    this.roomCode.textContent = roomCode
    this.update(update)
  }

  update(update: MultiplayerClientUpdate): void {
    const connectedLabel = update.state === 'connecting' ? 'CONECTANDO'
      : update.state === 'authenticating' ? 'AUTENTICANDO'
        : update.state === 'lobby' ? 'CONECTADO · LOBBY'
          : update.state === 'playing' ? 'CONECTADO · PARTIDA'
            : update.state === 'ended' ? 'SESION FINALIZADA'
              : update.state === 'closed' ? 'DESCONECTADO' : 'DESCONECTADO'
    this.root.querySelector<HTMLElement>('[data-value="connection"]')!.textContent = connectedLabel
    if (!this.lobbyPanel.hidden) {
      this.status.textContent = update.message
      this.roster.replaceChildren(...update.players.map((player) => {
        const item = document.createElement('li')
        item.className = 'multiplayer-roster__player'
        item.dataset.playerId = player.id
        const name = document.createElement('strong')
        name.textContent = player.displayName
        const role = document.createElement('span')
        role.textContent = player.role === 'host' ? 'ANFITRION' : 'INVITADO'
        const state = document.createElement('small')
        state.textContent = player.connected ? 'EN LINEA' : 'DESCONECTADO'
        item.append(name, role, state)
        return item
      }))
      this.startButton.hidden = this.currentRole !== 'host'
      this.startButton.disabled = update.state !== 'lobby'
      const note = this.root.querySelector<HTMLElement>('[data-value="start-note"]')!
      note.textContent = update.state === 'playing'
        ? 'Partida en curso. No se admiten nuevas incorporaciones.'
        : update.state === 'ended'
          ? 'La sala termino o perdio la conexion con su anfitrion.'
          : 'El anfitrion puede empezar solo; el segundo jugador puede entrar mientras esta sala siga abierta.'
    }
  }

  showResult(result: NetworkGameResult): void {
    this.homePanel.hidden = true
    this.lobbyPanel.hidden = true
    this.resultPanel.hidden = false
    const output = this.root.querySelector<HTMLElement>('[data-value="result"]')!
    output.replaceChildren()
    const addRow = (label: string, value: string): void => {
      const row = document.createElement('div')
      const term = document.createElement('dt')
      const definition = document.createElement('dd')
      term.textContent = label
      definition.textContent = value
      row.append(term, definition)
      output.append(row)
    }
    addRow('OLEADAS SUPERADAS', String(result.wavesSurvived))
    addRow('SUPERVIVENCIA', `${Math.floor(result.survivalSeconds / 60)}:${String(Math.floor(result.survivalSeconds % 60)).padStart(2, '0')}`)
    for (const player of result.kills) {
      const name = this.root.querySelector<HTMLElement>(`[data-player-id="${CSS.escape(player.playerId)}"] strong`)?.textContent ?? 'JUGADOR'
      addRow(`BAJAS · ${name}`, String(player.count))
    }
  }

  showHome(): void {
    this.homePanel.hidden = false
    this.lobbyPanel.hidden = true
    this.resultPanel.hidden = true
    this.currentRole = null
  }

  setBusy(busy: boolean, message = ''): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="create"], [data-action="join"]').forEach((button) => { button.disabled = busy })
    const status = this.root.querySelector<HTMLElement>('[data-value="home-status"]')
    if (status) status.textContent = message
  }

  setLobbyMessage(message: string): void {
    this.status.textContent = message
  }

  destroy(): void {
    this.listeners.abort()
    this.root.remove()
  }

  private readonly onClick = (event: MouseEvent): void => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null
    if (!button || button.disabled) return
    const name = this.nameInput.value
    switch (button.dataset.action) {
      case 'create': this.actions.onCreate(name); break
      case 'join': this.actions.onJoin(this.codeInput.value, name); break
      case 'start': this.actions.onStart(); break
      case 'menu': this.actions.onReturnToMenu(); break
      case 'lobby': this.actions.onReturnToLobby(); break
      case 'copy': void navigator.clipboard?.writeText(this.roomCode.textContent ?? '').then(() => { this.status.textContent = 'Codigo copiado.' }).catch(() => { this.status.textContent = 'No se pudo copiar; selecciona el codigo.' }); break
    }
  }

  private readonly onInput = (event: Event): void => {
    const input = event.target
    if (input instanceof HTMLInputElement && input.dataset.field === 'code') input.value = input.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 12)
  }
}
