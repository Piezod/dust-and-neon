# Mobile Overhaul M1

Estado: implementada; pendiente de validacion en Android e iPhone reales.

## Causas y cambios

- El frustum anterior mostraba al menos 34 unidades verticales incluso en un telefono de 375 px de alto. La camara movil muestra 18.5 unidades, ajusta el ancho minimo y permite zoom independiente de PC (0.75-1.5). No se escalan colliders.
- En bosses, la vista se amplia suavemente un 25% y el foco se aproxima al punto intermedio jugador/boss con desplazamiento limitado. Parametros centralizados en `src/config/camera.config.ts`.
- El controlador normalizaba todo movimiento: incluso un pequeno desplazamiento del joystick daba velocidad maxima. Ahora solo limita vectores de longitud mayor que uno.
- El joystick derecho enviaba coordenadas absolutas junto al borde de la pantalla. Ahora envia una direccion relativa, proyectada al plano XZ usando la base de la camara; dispara al superar la zona muerta y respeta la cadencia existente.
- El selector del pomo izquierdo encontraba primero el derecho. Cada joystick actualiza ahora su propio pomo.
- Movimiento, apuntado y solicitudes de habilidades convergen en InputManager/PlayerController. El gameplay usa las mismas rutas de Player, AbilityManager y CombatSystem en PC y tactil.
- Cada joystick conserva un pointerId; Dash admite un tercer contacto y se solicita en pointerdown. pointerup, pointercancel y lostpointercapture solo liberan al propietario. Blur, visibilidad, pausa y resize limpian entradas.
- El HUD movil no cambia el diseno de PC. Habilidades y cooldown se muestran en sus controles tactiles; salud, energia, oro y oleada permanecen arriba. Bosses tienen su propia franja.
- Preferencias persistentes: tamano, opacidad, sensibilidad tactil, zona muerta, zoom movil y calidad. Sensibilidad tactil modifica el umbral radial de activacion; no distorsiona el angulo de apuntado. Los ajustes existentes se conservan; una instalacion nueva tactil inicia en calidad baja.

## Rendimiento

DPR: bajo 1, medio/alto limitados a 1.25 en movil. MSAA desactivado en movil. Se reutilizan perfiles existentes de particulas, polvo, luces y efectos. Sombras y mapa solar se actualizan con la calidad. No se reducen enemigos ni la precision de colisiones/proyectiles. No hay postprocesado nuevo. Audio existente: desbloqueo por gesto, voces limitadas y limpieza de recursos.

No se han medido FPS en dispositivos fisicos. Los pasos de simulacion controlados de los checks no son un benchmark. Objetivos pendientes: 60 FPS en hardware capaz, cerca de 30 FPS en hardware modesto, y temperatura/memoria tras una sesion prolongada.

## Reproducir

1. Ejecutar `npm run dev -- --host 0.0.0.0 --port 5174` desde la carpeta del proyecto.
2. Conectar telefono y PC a la misma Wi-Fi y abrir `http://192.168.0.29:5174/` (la IP local puede cambiar). Permitir Vite en redes privadas si Windows Firewall lo solicita. No exponer este servidor a Internet.
3. En Ajustes elegir tamano, opacidad, sensibilidad, zona muerta, zoom y calidad. Girar a horizontal antes de iniciar una partida.
4. Mantener el pulgar izquierdo parcialmente desplazado: debe andar mas despacio. Mantener el derecho desplazado: debe apuntar y disparar continuamente. Usar un tercer dedo para Dash sin interrumpir los dos primeros.
5. Soltar cada dedo por separado, abrir pausa, reanudar, ocultar la pestana, cambiar de aplicacion, girar a vertical y volver a horizontal. Ninguna entrada debe quedarse pulsada; una pausa manual debe seguir pausada tras girar.
6. Completar oleadas, comprar mejoras, elegir perk, continuar, derrotar un boss, pasar de capitulo, morir y reintentar usando solo toques.
7. Registrar modelo, OS, navegador, calidad, zoom, FPS medidos, calentamiento y cualquier perdida de contacto. Repetir en Android/Chrome e iPhone/Safari.

## Limites de navegador

- La emulacion de Chromium no valida Safari, notch fisico, latencia, ergonomia ni limitaciones termicas/GPU reales.
- No se fuerza orientacion. Portrait pausa el juego y pide girar; los menus siguen accesibles.
- Fullscreen solo se ofrece si el navegador declara soporte para documentos. Requiere gesto y puede ser rechazado; se ignora el rechazo y el juego sigue funcionando. Safari/iOS puede no ofrecerlo; usar horizontal o anadir a inicio.
- Las barras del navegador pueden seguir visibles. El canvas usa su contenedor `100dvh`, resize y visualViewport; safe areas usan `viewport-fit=cover` y `env(safe-area-inset-*)`.
- Los gestos de sistema del borde no se pueden bloquear de forma fiable. Se mantienen margenes y se limpia cualquier contacto cancelado.
- Audio puede requerir un nuevo gesto tras una interrupcion del sistema. El mecanismo existente desbloquea audio en los menus.
- Almacenamiento privado/restringido puede impedir persistir ajustes; permanecen activos durante la sesion.

## Comprobaciones automatizadas

Desde la consola del servidor de desarrollo:

```js
(await import('/src/ui/TouchControls.check.ts')).runTouchControlsChecks()
```

Incluye analogico real, ocho direcciones, firing, Dash concurrente, tres contactos, cancelacion, perdida de capture, energia, pausa/reanudacion, teclado/raton, colisiones, ajustes y calculo de frustum en los cinco tamanos solicitados. Los eventos sinteticos se complementan con contactos CDP en Playwright.

Runner completo, sin agregar dependencias al juego (Vite debe estar activo):

```powershell
npx --yes --package playwright -c "node tests/mobile-overhaul.integration.mjs"
npm run build
```

El runner usa Edge instalado y Playwright temporal. Para otro canal instalado usar `M1_BROWSER_CHANNEL`; la URL se configura con `M1_URL`. Las capturas son de Edge headless con `hasTouch`, no de Safari ni de hardware movil. El navegador integrado produjo un recorte invalido a 1280x720; las capturas finales se regeneraron con el runner independiente y se inspeccionaron visualmente.

Resultados del 2026-11-02:

- 245 checks de tactil, habilidades, combate, bosses, ajustes, campana completa, progresion, muerte y ciclo de partida.
- Contactos CDP reales: movimiento analogico + disparo + Dash, liberacion independiente del tercer contacto, cancelacion completa.
- Toques reales: campana, ajustes, inicio, pausa/reanudacion, salida, nueva partida, compra de mejora, perk, continuar y reintentar tras Game Over.
- Portrait pausa; landscape reanuda si no habia pausa previa. La pausa manual sobrevive al giro; blur pausa. Preferencias moviles persisten.
- Cinco viewports solicitados: canvas con tamano correcto, 15-16 colores distintos en muestras WebGL, HUD y controles dentro de pantalla, sin solapar Dash/joystick ni HUD/movimiento.
- Combate automatizado a 844x390: Sheriff de 1250 HP derrotado mediante PointerEvents de joystick y Dash, estadisticas normales, sin dano directo ni curacion externa. Una ejecucion registro 92 disparos, 5 Dash, 45.8 segundos simulados y 71 HP finales (incluye recuperacion natural del boss). El runner exige victoria con el jugador vivo; el resultado puede variar por RNG.
- Se omite el render entre pasos del bot para acelerar esta prueba; por tanto ese tiempo simulado no representa FPS ni duracion real de una sesion.
- En una escena comparable, calidad media registro 1063 draw calls y baja 410; no son mediciones de FPS. El fixture final con enemigo adicional registra aproximadamente 420-453 draw calls segun viewport.
- Regresion real de teclado/raton en contexto sin tactil, camara de PC con alto 34 y zoom 1, controles tactiles ocultos.
- Build de produccion correcto; Vite conserva su aviso de chunk mayor de 500 kB. Sin dependencias nuevas de runtime.

Evidencia: [resultados JSON](mobile-m1/results.json), [combate 667x375](mobile-m1/combat-667x375.png), [844x390](mobile-m1/combat-844x390.png), [932x430](mobile-m1/combat-932x430.png), [915x412](mobile-m1/combat-915x412.png), [1280x720](mobile-m1/combat-1280x720.png), [resultado boss](mobile-m1/boss-combat-result-844x390.png), [tienda](mobile-m1/shop-667x375.png), [Game Over](mobile-m1/game-over-667x375.png).

La aceptacion final requiere completar un boss sin ayudas en telefono fisico. Tambien quedan pendientes interrupciones de audio de iOS, gestos de sistema, notch real, WebGL2 en equipos antiguos y pruebas prolongadas de memoria/temperatura.

## Archivos

- `src/config/camera.config.ts`: deteccion y parametros de camara.
- `src/core/Game.ts`: viewport, camara, calidad y ciclo de pausa/orientacion.
- `src/core/InputManager.ts`, `src/core/PlayerController.ts`: acciones comunes, analogico y apuntado relativo.
- `src/core/GameSettings.types.ts`, `src/app/SettingsStore.ts`, `src/app/AppFeatures.check.ts`: preferencias, defaults por dispositivo y persistencia.
- `src/ui/TouchControls.ts`, `src/ui/TouchControls.check.ts`: joysticks, multitouch, Dash, fullscreen y checks.
- `src/ui/menu/MenuView.ts`: controles de ajustes.
- `src/style.css`, `src/ui/player-hud.css`, `src/ui/campaign-hud.css`, `src/ui/intermission-panel.css`: distribucion movil, safe areas y notificaciones.
- `tests/mobile-overhaul.integration.mjs`: pruebas reproducibles y generacion de capturas/resultados.
- `DUST_AND_NEON_ROADMAP.md`, este documento y `docs/mobile-m1/`: entrega y evidencia.