import './style.css'
import { ApplicationController } from './app/ApplicationController'

const app = document.querySelector<HTMLDivElement>('#app')!

try {
  const application = new ApplicationController(app)
  import.meta.hot?.dispose(() => application.destroy())
} catch (error) {
  console.error(error)
  const message = document.createElement('p')
  message.className = 'error'
  message.textContent = 'No se pudo iniciar el escenario 3D. Comprueba que WebGL este disponible y revisa la consola.'
  app.append(message)
}
