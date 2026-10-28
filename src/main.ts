import './style.css'
import { Game } from './core/Game'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <header class="identity"><span class="eyebrow">SECTOR 07 / DEAD SIGNAL</span><h1>DUST <span>&</span> NEON</h1></header>
  <footer class="location"><span class="status-light"></span> LAST LIGHT OUTPOST <span class="coordinates">34.08 N / 116.42 W</span></footer>
`

try {
  const game = new Game(app)
  game.start()
  import.meta.hot?.dispose(() => game.dispose())
} catch (error) {
  console.error(error)
  const message = document.createElement('p')
  message.className = 'error'
  message.textContent = 'No se pudo iniciar el escenario 3D. Comprueba que WebGL este disponible y revisa la consola.'
  app.append(message)
}
