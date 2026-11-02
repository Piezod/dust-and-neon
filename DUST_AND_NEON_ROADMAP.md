# Dust & Neon — Roadmap de desarrollo del núcleo roguelike

**Versión:** 1.0 · **Estado:** Fases 4A–4D validadas por el usuario; 4E implementada y pendiente de validación visual. Mobile Overhaul M1 implementada; pendiente de validación en dispositivo real.

> Este documento es la fuente de planificación para GitHub Copilot. Antes de cada fase, inspecciona el repositorio real. No marques una tarea como completada sin cambios verificables, pruebas ejecutadas y validación manual del usuario.

## 0. Contexto y reglas permanentes

- Juego: shooter roguelike 3D con estética western alienígena, Three.js + TypeScript + Vite, cámara ortográfica inclinada.
- Existente: movimiento WASD, apuntado con ratón, `Player`, `PlayerController`, `PlayerVisual`, `CharacterStats`, HUD/F3, `Ability`, `AbilityManager`, `DashAbility`, configuración de habilidades.
- Mantener Dash y el CSS personalizado. La habilidad granada se pospone.
- TypeScript estricto; no añadir dependencias ni frameworks sin autorización.
- Separar dominio/simulación, configuración, input y representación Three.js.
- Preferir composición y estrategias a herencia profunda; evitar `switch` monolíticos y lógica de cada enemigo/item en `Game.ts`.
- Reutilizar estadísticas, salud y energía existentes; no duplicar su estado.
- Tiempo de simulación con `deltaTime`; entradas reproducibles y RNG inyectable donde corresponda.
- Destruir meshes, geometrías, materiales y listeners cuando proceda; evitar fugas.
- Diseñar contratos pequeños y necesarios ahora; **no implementar abstractions vacías** para ataques que aún no existen.
- Cada fase se implementa por separado. **Detenerse al terminarla** hasta la aprobación del usuario.

## 1. Visión de arquitectura

```text
Game / Scene composition root
  ├── InputManager + PlayerController
  ├── Player + CharacterStats + AbilityManager (Dash)
  ├── CombatSystem
  │     ├── Attack definitions + attack execution
  │     ├── ProjectileSystem + hit detection
  │     └── Damage resolution / Damageable contracts
  ├── EnemyManager
  │     ├── EnemyDefinition / Enemy instance
  │     ├── Movement/AI strategies
  │     └── Attack selection (multiple attacks per enemy)
  ├── LootSystem + Pickups
  ├── WaveManager / run state machine
  └── Progression: Wallet + Upgrades + Perks
```

**Principios clave**

1. Una definición es dato inmutable; cada instancia conserva su estado mutable (HP, cooldown, posición).
2. Ataques básicos y habilidades activas son distintos mecanismos de activación, pero **comparten** proyectiles, colisiones y daño.
3. `source`/`team`/`target` permiten reutilizar ataques entre jugador y enemigos sin fuego amigo accidental.
4. Las mejoras se aplican a la instancia de la partida, nunca mutando configuraciones globales compartidas.
5. El botín usa tablas explícitas: selección ponderada exclusiva o tiradas independientes, sin confundir pesos con porcentajes.
6. La UI observa estado; no es la fuente de verdad.

## 2. Orden y estado

| Fase | Resultado visible | Estado |
|---|---|---|
| 4A · Disparo básico | Revólver que dispara hacia el cursor | ✅ Validada por el usuario |
| 4B · Enemigos | Enemigos configurables con IA, ataques y daño | ✅ Validada por el usuario |
| 4C · Botín | Vida, energía y oro recogibles con probabilidades | ✅ Validada por el usuario |
| 4D · Oleadas | Spawns progresivos y fin de oleada | ✅ Validada por el usuario |
| 4E · Mejoras | Pantalla entre oleadas, oro, upgrades y perks | 🟨 Implementada; pendiente de validación visual del usuario |
| 4F · Extensibilidad | Segundo enemigo, ataques alternativos y balance | 🟨 Implementada; pendiente de validación visual del usuario |
| M1 · Mobile Overhaul | Cámara móvil, twin-stick, multitouch, Dash, HUD y menús táctiles | Implementada; pendiente de validación en Android/iPhone reales |
| Hitbox Rework | Radios de daño independientes, decoración atravesable y eliminación de barras flotantes | Implementado y validado automáticamente el 2026-11-02; pendiente de aceptación visual del usuario |

Para cada fase, Copilot debe actualizar la tabla y checklist **solo tras** completar los criterios de aceptación y recibir confirmación.

---

## Hitbox Rework y limpieza de HUD

Implementado el 2026-11-02. Sin nuevas armas, enemigos, capítulos, habilidades, dependencias, commit ni push. La aceptación del usuario y las pruebas en dispositivos físicos siguen pendientes.

### Causas y dimensiones

- `Enemy.getCombatBounds()` reutilizaba `collisionRadius`: un disparo rasante al modelo podía quedar fuera del radio físico. Los proyectiles ya tenían barrido continuo de segmento; no se ha sustituido por comprobaciones discretas por frame.
- Las rocas grandes y bases decorativas estaban registradas en el mismo array sólido que edificios: bloqueaban movimiento, navegación, disparos y visión. No era un problema exclusivo de F3.
- Algunos bosses tenían una superficie visible mayor que su collider: el caparazón de la Matriarca del Abismo se construye con una esfera de radio 2.4, pero recibía daño con radio 1.65.
- Rastrero: radio físico **0.55**, radio de daño **0.715**. Forajido: físico **0.65**, daño **0.845**. Incremento del 30 %, configurable mediante `damageHitboxRadius`; las definiciones sin override usan el factor central.
- Los proyectiles siguen sumando su propio radio al volumen objetivo. La posición se consulta desde la raíz de cada instancia; feedback y animación no cambian su radio físico.
- Bosses: semiejes de daño X/Z independientes del movimiento y orientados con el modelo. Sheriff **1.15/1.05**; Matriarca del Abismo **2.4/2.4**; Predicador **1.65/1.65**; Matriarca del Fango **1.95/1.8**; Alguacil de la Tormenta **1.25/1.25**; Fundidor del Eclipse **1.45/1.25**. No se aplica el factor normal a los bosses.

### Obstáculos, navegación y HUD

- `src/config/collision.config.ts` centraliza decoración y estructuras con criterios coherentes para movimiento, proyectiles, línea de visión y navegación. Las entidades ofrecen límites físicos separados de sus límites de daño.
- Dejan de crear o registrar `Box2`: **rock**, **crystal-base**, **cactus**, **spore-tree**, **spore-base**. Sus modelos, luces y efectos permanecen. Las piedras pequeñas ya carecían de collider.
- Permanecen sólidos edificios, porches, mesas grandes que definen el escenario, maquinaria, antenas, generadores, pilares del Eclipse, barriles y cajas. No se alteran los límites existentes.
- A* se conserva para estructuras, con sus márgenes y cooldown de replanificación existentes. La decoración no genera desvíos ni consultas contra referencias retiradas. La reconstrucción del mundo conserva la identidad del array de obstáculos.
- Separación entre enemigos y espaciado de spawn usan `getPhysicalBounds()`, no el radio de daño ampliado. Así no se agrandan indirectamente las colisiones.
- Se eliminan los meshes de relleno/fondo de barras normales, sus materiales y sus actualizaciones; no quedan barras ocultas. Se conservan HP interno, flash, eventos/números de daño, muerte y loot. Los bosses no tenían barra flotante y conservan la barra principal del HUD.
- Se corrige además el registro del material del telégrafo normal para liberarlo junto a la geometría. Las pruebas escuchan los eventos `dispose` de todos los recursos visibles de ambas instancias y exigen una única liberación.
- F3: físico rojo, daño cian, estructuras ámbar; incluye elipses y rutas de bosses, trayectorias previstas y barridos reales recientes. Historial acotado a 64 segmentos durante 350 ms, limpiado en `dispose`. El overlay estructural se refresca al cambiar de escenario y no incluye decoración.

### Validación ejecutada

- `npm run build`: correcto (TypeScript + Vite). Advertencia de Vite por chunk de juego mayor de 500 kB; no se ha ampliado el alcance a dividir bundles.
- Pruebas en navegador: **37 combate**, **134 enemigos**, **2548 navegación**, **29 mundo**, **10 F3**, **64 bosses**, **29 habilidades/Dash**, **43 controles táctiles**. Incluyen ambos bordes de daño, disparos a 1000 unidades/s, objetivo movido, overrides por tipo, independencia de instancias, impacto único, misses exteriores, radios físicos intactos, elipse orientada, exclusión de decoración, estructuras sólidas, daño a seis bosses y limpieza real de recursos.
- También pasan enemigos experimentales (73), loot (43), oleadas (25), dificultad/habilidades (33), extensibilidad (11), estadísticas (118), HUD (34), efectos (12), protocolo de red (17), aplicación (10), campaña (9 + 43), ciclo de vida (1), progresión (37 + 1) y muerte del jugador (12).
- `npm run test:multiplayer:worker`: **3/3** después de iniciar el worker local con `npm run dev:worker`. El primer intento sin servidor devolvió `ECONNREFUSED`; no se modificó código del worker.
- Runner Playwright/Edge existente ampliado: **667x375, 844x390, 932x430, 915x412 y 1280x720**, canvas no vacío mediante lectura de píxeles, HUD/controles dentro del viewport, triple contacto nativo movimiento/disparo/Dash, cancelación, pausa/rotación, tienda, reintento y teclado/ratón desktop. Sin errores de página. Capturas móvil y escritorio inspeccionadas: enemigos sin barras individuales y barra principal de boss visible.
- Combate táctil reproducible: Sheriff de **1250 HP derrotado**, **93 disparos**, **5 Dash**, jugador con **64 HP** al finalizar; sin alterar estadísticas ni aplicar daño/curación directa. Pasos de simulación controlados, no benchmark de FPS ni evaluación humana de ergonomía.
- Persecución probada con simulación del EnemyManager sobre la roca real `Rock:90`: la cruza sin desvío, vibración lateral ni rutas A* activas. Se mantienen casos de rodear muros, no penetrar estructuras y disparar al recuperar línea de visión. No se presenta esto como aceptación manual de navegación continua.
- No se ha certificado Android/iPhone real ni rendimiento sostenido. Evidencias de esta ejecución en `%TEMP%/dust-hitbox-rework`, sin sobrescribir las capturas M1 anteriores.

Reproducción desde la raíz del proyecto, con Vite en el puerto 5174:

```powershell
npx --yes --package playwright -c "node tests/mobile-overhaul.integration.mjs $env:TEMP/dust-hitbox-rework"
npm run build
```

### Archivos afectados

- Configuración: [collision.config.ts](src/config/collision.config.ts), [enemies.config.ts](src/config/enemies.config.ts), [bosses.config.ts](src/config/bosses.config.ts).
- Enemigos: [Enemy.ts](src/enemies/Enemy.ts), [Enemy.types.ts](src/enemies/Enemy.types.ts), [EnemyManager.ts](src/enemies/EnemyManager.ts), [EnemyVisual.ts](src/enemies/EnemyVisual.ts).
- Combate y bosses: [Combat.types.ts](src/combat/Combat.types.ts), [ProjectileSystem.ts](src/combat/ProjectileSystem.ts), [Boss.ts](src/bosses/Boss.ts), [Boss.types.ts](src/bosses/Boss.types.ts).
- Mundo y depuración: [World.ts](src/world/World.ts), [Game.ts](src/core/Game.ts), [GameDebugVisualization.ts](src/core/GameDebugVisualization.ts), [PlayerHUD.ts](src/ui/PlayerHUD.ts).
- Comprobaciones: [Enemy.check.ts](src/enemies/Enemy.check.ts), [EnemyNavigation.check.ts](src/enemies/EnemyNavigation.check.ts), [Combat.check.ts](src/combat/Combat.check.ts), [Boss.check.ts](src/bosses/Boss.check.ts), [World.check.ts](src/world/World.check.ts), [GameDebugVisualization.check.ts](src/core/GameDebugVisualization.check.ts).
- Integración: [mobile-overhaul.integration.mjs](tests/mobile-overhaul.integration.mjs). Este roadmap registra implementación, resultados y límites de validación.

## M1 — Mobile Overhaul

Implementada el 2026-11-02. No implica certificación de rendimiento ni aceptación en teléfono físico.

- [x] Auditar cámara/frustum, renderer/DPR, input, joysticks, disparo, HUD, menús y viewport.
- [x] Cámara móvil independiente: 18.5 unidades verticales frente a 34 de PC, ancho mínimo adaptable, zoom persistente y composición ampliada durante bosses. Sin modificar colliders.
- [x] Movimiento analógico con zona muerta, apuntado relativo al jugador a 360 grados y disparo mantenido con la cadencia existente.
- [x] Propiedad independiente por pointerId, tres contactos, Dash en pointerdown, cancelación/capture/foco, pausa y reinicio sin entradas atascadas.
- [x] Landscape prioritario, aviso y pausa en portrait, safe areas, canvas dinámico y fullscreen opcional sin forzar orientación.
- [x] HUD móvil, tienda y menús utilizables mediante toque; avisos de logros sin interceptar controles.
- [x] Persistir tamaño, opacidad, sensibilidad táctil, zona muerta, zoom móvil y calidad con SettingsStore.
- [x] Perfil inicial móvil bajo, DPR limitado, MSAA desactivado; reutilizar límites existentes de efectos/luces sin reducir precisión del combate.
- [x] Playwright/Edge con emulación táctil y capturas en 667×375, 844×390, 932×430, 915×412 y 1280×720. Checks WebGL no vacío y geometría de HUD/controles.
- [x] Regresiones de habilidades, combate, bosses, campaña completa, progresión, muerte, ajustes y ciclo de partida.
- [x] Bot de prueba derrota al Sheriff de Hierro de 1250 HP mediante eventos de joystick y Dash, sin alterar estadísticas ni aplicar daño directo. Simulación controlada, no medición de FPS ni prueba de ergonomía humana.
- [ ] Completar un combate contra un boss usando exclusivamente toques en Android/Chrome e iPhone/Safari reales.
- [ ] Medir FPS, temperatura, memoria y estabilidad prolongada en teléfonos de distintas gamas.

Detalles, limitaciones, instrucciones y archivos: [docs/MOBILE_M1_VALIDATION.md](docs/MOBILE_M1_VALIDATION.md). Capturas y resultados reproducibles: [docs/mobile-m1/results.json](docs/mobile-m1/results.json).

## 4A — Combate básico: revólver y proyectiles

**Objetivo:** disparar con clic izquierdo (mantener para disparo continuo) hacia la dirección de apuntado existente.

### Diseño mínimo

- Definición tipada de arma/ataque básico: ID, daño, cadencia, velocidad, alcance, tipo de daño.
- `AttackController` o equivalente: gestiona cadencia por instancia del arma, sin coste de energía.
- `ProjectileSystem`: crea, actualiza, detecta impactos y retira proyectiles.
- `DamageContext` y contrato `Damageable` para futura integración con enemigos; no implementar enemigos todavía.
- `CombatSystem` coordina sistemas y registra objetivos/obstáculos existentes según la arquitectura real.
- Posición de disparo coherente con el personaje; usar el apuntado actual, no implementar otro.
- Colisión continua o barrido de segmento entre posición previa y nueva para evitar atravesar objetivos a gran velocidad; definir claramente cómo se consultan obstáculos.
- Facciones/source para evitar que una bala impacte a su emisor.
- Sin munición ni recarga en esta fase. No implementar granada ni más tipos de ataque.

### Valores iniciales

| Parámetro | Valor |
|---|---|
| Daño | 15 |
| Cadencia | 2 disparos/s |
| Velocidad de bala | 25 unidades/s |
| Alcance | 20 unidades |
| Tipo de daño | físico |
| Control | ratón izquierdo |

### Checklist

- [x] Inspeccionar input, aiming, player, scene y bucle real.
- [x] Presentar plan breve de archivos antes de editar.
- [x] Implementar contratos mínimos, configuración y disparo.
- [x] Implementar visual de bala sencillo y retirada de recursos.
- [x] Respetar UI/F3, Dash y foco del navegador.
- [x] Verificar cadencia con distintos `deltaTime` (incluidos frames largos).
- [x] Verificar dirección, distancia, expiración y barrido de impactos.
- [x] Verificar ausencia de autoimpacto, fugas evidentes y regresiones.
- [x] Ejecutar `npm run build` y checks disponibles; registrar resultados reales.
- [x] Usuario confirma prueba en navegador antes de 4B.

### Resultado de implementación 4A (validada por el usuario)

- `src/combat/` contiene `Combat.types.ts`, `AttackController.ts`, `ProjectileSystem.ts`, `Damageable.ts`, `DamageResolver.ts`, `CombatSystem.ts` y `Combat.check.ts`.
- `src/config/combat.config.ts` define el ataque `player.revolver`: 15 de daño, 2 disparos/s, velocidad 25, alcance 20 y daño físico. No consume energía.
- Diagnóstico 4A: canvas, `pointerdown`, pointer capture, estado mantenido, solicitud del controlador, cadencia, muzzle, dirección XZ normalizada, escena y `Game.tick` están conectados. La esfera inicial de radio 0.09 unidades era demasiado pequeña para distinguirla durante su recorrido; se aumentó a 0.18 y se reforzó su material emisivo turquesa. Las colisiones no se desactivaron.
- Las comprobaciones de teclado se ejecutaban contra `window`, compartiendo eventos con el `InputManager` de la partida; podían dejar WASD pulsado al devolver el foco al juego. Se inyectó un `EventTarget` en `InputManager` y los checks ahora usan targets aislados (el juego conserva `window`).
- `PlayerVisual` expone el punto mundial del cañón del revólver. `PlayerController` reutiliza su mira existente y gestiona botón izquierdo mantenido, pointer capture, liberación/cancelación y pérdida de foco.
- `CombatSystem` coordina cadencia, proyectiles y `World.obstacles`; el barrido segmento-círculo detecta el objetivo más cercano y segmento-AABB detiene el proyectil ante obstáculos. El proyectil desaparece al impactar o agotar alcance.
- `Damageable` y `DamageContext` son contratos mínimos; no se implementaron enemigos.
- `src/abilities/` contiene un placeholder preexistente `GrenadeAbility`; permanece sin lógica de lanzamiento y no se registra ni se integra en 4A.
- Configuración preexistente de Dash observada durante esta fase: coste 20, cooldown 2 s y velocidad 30. Se conservó sin cambios.
- Verificación ejecutada: `npm run build` correcto con TypeScript estricto. Vite muestra la advertencia existente del chunk mayor de 500 kB.
- Checks manuales ejecutados en navegador: 116 de estadísticas, 34 del HUD, 29 de habilidades y 31 de combate. La prueba integrada recorre `pointerdown` → `PlayerController` → `CombatSystem` → mesh visible en escena → actualización de posición; también verifica liberación y energía intacta.
- Prueba con Playwright en la página real: el clic izquierdo sobre el canvas produjo dos disparos en 0.62 s; el estado firing se limpió al soltar, el HUD de energía permaneció en 100/100 y el cursor definió una dirección XZ finita. Captura visual comprobó el proyectil turquesa en pantalla.
- Validación del usuario recibida el 2026-10-31; la fase 4A queda completada.

**Criterio de aceptación:** el personaje puede caminar, apuntar y disparar; mantener clic respeta 2 disparos/s; balas desaparecen al alcanzar 20 unidades o impactar; Dash sigue funcionando.

---

## 4B — Enemigos, IA y daño

**Objetivo:** primera amenaza jugable.

### Diseño

- `EnemyDefinition` (ID, nombre, stats, velocidad, radio, visual, comportamiento, lista de ataques, `lootTableId`).
- `Enemy` mantiene estado por instancia; `EnemyManager` crea/actualiza/elimina.
- Estrategias de movimiento y selección de ataques, con condiciones de alcance, cooldown y prioridad.
- Reutilizar `Damageable`, `DamageContext` y sistema de combate de 4A.
- Enemigo 1: **Rastrero alienígena**, persigue y ataca cuerpo a cuerpo con cooldown.
- Preparar **lista de ataques** para que el mismo enemigo use varios en 4F, sin codificar cada combinación en `Game.ts`.
- Evitar atravesar obstáculos según los mecanismos reales disponibles; si no existe navegación, documentar límites de una IA de persecución simple.
- Muerte idempotente: sin daño/ataque posterior ni doble eliminación.

### Resultado de implementación 4B (validada por el usuario)

- `src/enemies/Enemy.types.ts` contiene definiciones inmutables de enemigo, IA, estado, visual, ataques y evento de muerte con `lootTableId` opcional.
- `Enemy` mantiene salud, estado, cooldowns por instancia y `Damageable`; `EnemyManager` registra objetivos, busca spawns despejados, actualiza, retira enemigos muertos y emite una sola notificación de muerte.
- `ChaseBehavior` y `KeepDistanceBehavior` son estrategias intercambiables. El selector usa rango, cooldown, prioridad descendente y desempate lexical por ID.
- Los ejecutores actuales son melee y proyectil; plasma reutiliza `CombatSystem` y `ProjectileSystem`. El jugador también implementa `Damageable` y recibe daño a través de `CharacterStats`.
- `EnemyVisual` crea geometría diferenciada y una barra de salud sobre cada enemigo. `Game` crea tres rastreros y un forajido desde `COMBAT_TEST_SPAWNS`; F3 muestra el número de enemigos vivos.
- Movimiento usa `deltaTime`, subpasos y deslizamiento/desvío local contra los `Box2` y radios de actores. No hay pathfinding global; paredes extensas o esquinas complejas pueden hacer que un enemigo espere o tarde en rodear.
- No se generan drops, oleadas, tienda, perks, granadas ni jefes.
- Verificación ejecutada: `npm run build` correcto con TypeScript estricto; Vite mantiene la advertencia del bundle superior a 500 kB.
- Checks manuales en navegador: 116 de estadísticas, 34 del HUD, 29 de habilidades, 31 de combate y 44 de enemigos. El juego mostró 4 enemigos registrados.
- El usuario confirmó visualmente la Fase 4B el 2026-10-31.

### Checklist

- [x] Crear y registrar enemigos por definición.
- [x] Persecución y ataque cuerpo a cuerpo funcionales.
- [x] Proyectiles del jugador dañan al enemigo.
- [x] Enemigo puede dañar al jugador sin duplicar salud.
- [x] Muerte y limpieza correctas; no se dispara doble evento de muerte.
- [x] Pruebas de alcance, cooldown, daño, muerte y regresiones.
- [x] Build y checks automatizados/manuales ejecutados.
- [x] Validación visual del usuario recibida antes de iniciar 4C.

**Criterio de aceptación:** aparece un enemigo, persigue, golpea, puede ser abatido con el revólver y desaparece sin errores.

---

## 4C — Loot, probabilidades y pickups

**Objetivo:** cada enemigo tiene `lootTableId` y su muerte genera botín opcional.

### Diseño

- `ItemDefinition` con `id`, `type`, parámetros y comportamiento de recogida registrable.
- `LootTableDefinition` con modo explícito:
  - `weighted-exclusive`: un resultado por tirada (incluye `none`), probabilidades normalizadas.
  - `independent-rolls`: cada entrada puede aparecer con probabilidad propia; admite múltiples drops.
- Cantidades `min`/`max`, tiradas configurables, RNG inyectable.
- Ejemplo de **selección exclusiva**: salud 15 %, energía 20 %, oro 40 %, nada 25 %.
- Pickups en suelo, radio de recogida y efectos: curación, energía, saldo de oro.
- Botín generado **exactamente una vez** por muerte; evitar duplicados.
- Preparar ampliación futura para suerte, rarezas y otros tipos sin lógica por item en `Game.ts`.

### Checklist

- [x] Tablas tipadas y RNG determinista en tests.
- [x] Resolver tablas exclusivas e independientes correctamente.
- [x] Mostrar y recoger pickups.
- [x] Respetar máximos de vida y energía.
- [x] Añadir saldo de oro de partida, sin tienda aún.
- [x] Pruebas de distribución/umbrales, cantidades, no duplicación y recogida.
- [x] Build y checks ejecutados.
- [x] Validación visual del usuario recibida antes de iniciar 4D.

### Resultado de implementación 4C (validada por el usuario)

- `src/loot/` contiene tipos, validación de tablas, roller con RNG inyectable, `Wallet`, resolver, pickup, visual, manager y checks.
- `src/config/loot.config.ts` define `enemy-basic` como tirada exclusiva (15 % vida, 20 % energía, 40 % oro y 25 % nada) y `enemy-mechanical` como tiradas independientes (100 % oro, 25 % vida y 35 % energía). Las definiciones enemigas apuntan a estas tablas por ID.
- `LootManager` escucha el evento único de muerte, omite enemigos sin tabla, distribuye drops alrededor del origen evitando obstáculos/pickups y retira cada instancia al recogerla. No se generan drops si el jugador está muerto.
- Vida y energía llaman a `CharacterStats.heal()`/`restoreEnergy()` y respetan máximos. `Wallet` es estado independiente de la partida con consulta, suscripción, `canAfford`, `add` y `spend` validado.
- Los pickups usan geometrías/materiales Three.js propios, flotan con `deltaTime` y liberan recursos. F3 ofrece spawns de depuración deterministas, separados del roller normal.
- El HUD muestra oro y se actualiza por suscripción de `Wallet`; se conservaron los estilos personalizados anteriores.
- Verificación: build estricto correcto, con advertencia de Vite por chunk superior a 500 kB. Checks ejecutados: 116 de estadísticas, 34 HUD, 29 habilidades, 31 combate, 44 enemigos y 43 loot.
- Playwright con una instancia de `Game` y RNG fijado: la muerte generó el pickup de vida esperado; recogerlo cambió salud de 70 a 90. El spawn F3 de oro actualizó la cartera y HUD a 10.
- El usuario confirmó visualmente la Fase 4C el 2026-10-31.

**Criterio de aceptación:** eliminar enemigos puede dejar vida, energía u oro; se recogen y actualizan recursos de forma correcta.

---

## 4D — Oleadas y estados de partida

**Objetivo:** loop de combate repetible.

- `WaveDefinition`: composición de enemigos, cantidades, ritmo y escalado.
- `WaveManager`: `preparation` → `combat` → `completed` → `upgrades` → siguiente oleada; `game-over` al morir.
- Fin de oleada cuando no quedan spawns pendientes ni enemigos vivos.
- Spawns válidos lejos del jugador y fuera de obstáculos, con reintentos limitados y fallback explícito.
- Congelar/pausar correctamente simulación y entradas en la pantalla de mejoras.

### Checklist

- [x] Dos oleadas configuradas y verificables.
- [x] Spawn gradual y condición de fin correcta.
- [x] Estados y transiciones probados.
- [x] HUD indica oleada y enemigos restantes.
- [x] No hay spawns al pausar ni después de game-over.
- [x] Build y checks ejecutados.
- [ ] Validación visual del usuario antes de 4E.

### Resultado de implementación 4D (validada por el usuario)

- `src/waves/` contiene tipos, `WaveManager` y checks; `src/config/waves.config.ts` define dos composiciones configurables.
- `WaveManager` coordina `preparation` → `combat` → `completed` → `upgrades` → siguiente ola; entra en `game-over` al morir el jugador. El estado `upgrades` es una intermisión sin tienda ni compras.
- Los enemigos se generan progresivamente por grupo. `EnemyManager.trySpawn()` busca posiciones despejadas con radio seguro; se limita el número de intentos y, si fallan, se omite y contabiliza ese spawn.
- El HUD muestra oleada y enemigos restantes. No se simulan enemigos, loot ni movimiento durante `upgrades`; el estado `game-over` bloquea input y nuevos spawns.
- El estado de muerte procede de `CharacterStats.isAlive` (`currentHealth > 0`), no de un booleano duplicado. `spendEnergy`, `Ability.activate`, `AbilityManager.cancelAll`, `PlayerController` y `CombatSystem` rechazan o cancelan acciones del jugador muerto. Los proyectiles ya existentes pueden continuar; se bloquea la creación de nuevos proyectiles del jugador.
- Checks ejecutados: 116 estadísticas, 34 HUD, 29 habilidades, 31 combate, 44 enemigos, 43 loot, 12 de muerte y 17 de oleadas. Build estricto correcto; Vite conserva su advertencia por chunk mayor de 500 kB.
- Pendientes sin fase asignada: pantalla Game Over, animación de muerte, menú de reinicio y reaparición. No se implementaron.
- El usuario confirmó visualmente la Fase 4D el 2026-10-31.

---

## 4E — Economía, upgrades y perks

**Objetivo:** mejorar el personaje entre oleadas.

- `RunState`: oro y progreso solo de la partida actual.
- `Wallet`: añadir, consultar y gastar oro de forma validada.
- `UpgradeDefinition`: coste, niveles, requisitos y modificadores.
- `PerkDefinition`: efecto pasivo, restricciones y apilamiento explícito.
- `UpgradeManager`: aplica cambios a **instancias**, no a definiciones globales.
- Usar `CharacterStats` para stats del personaje; modificadores de arma separados para cadencia/velocidad/daño del proyectil.
- Pantalla entre oleadas con compra de upgrades y elección de perks; reanudar al terminar.
- Inicialmente: mejorar daño de revólver, cadencia, salud máxima; perks sencillos de ejemplo.
- Definir duración (solo partida) y posibilidad de reiniciar estado.

### Checklist

- [x] Comprar solo con saldo suficiente.
- [x] Mejoras alteran parámetros reales de combate.
- [x] Sin modificar definiciones compartidas.
- [x] Perks aplicados una sola vez según reglas de apilamiento.
- [x] Reiniciar partida restablece progresión temporal al crear una nueva instancia de Game/RunState; `RunState.reset()` revierte los efectos activos.
- [x] Build y checks ejecutados.
- [ ] Validación visual del usuario antes de 4F.

### Resultado de implementación 4E (validación visual del usuario pendiente)

- `src/progression/` contiene efectos tipados, `UpgradeManager`, `PerkManager`, `RunState` y checks; `src/config/progression.config.ts` centraliza costes, niveles, requisitos y perks.
- Las mejoras modifican `CharacterStats` mediante IDs propios o el estado runtime de `AttackController`; `REVOLVER_ATTACK` y las definiciones globales permanecen inmutables.
- `UpgradeManager` valida saldo, nivel máximo y prerequisitos antes de gastar. `PerkManager` aplica reglas unique/stackable y limita la elección por intermisión.
- `RunState` posee la Wallet y progreso temporal; resetearlo revierte modifiers y vacía el saldo. No hay persistencia.
- `WaveManager.completeIntermission()` enlaza el panel con la transición existente; hay botón Continuar y timeout de respaldo configurable. La UI presenta upgrades/perks y queda fuera de `Game.ts`.
- Verificación ejecutada: build estricto correcto, con advertencia de Vite por chunk mayor de 500 kB. Checks agregados pasan: 116 estadísticas, 34 HUD, 29 habilidades, 31 combate, 44 enemigos, 43 loot, 12 muerte, 17 oleadas, 37 progresión y 1 integración de Game.
- Pendiente la validación visual del usuario. No se ha comenzado la Fase 4F.

---

## 4F — Demostración de escalabilidad y balance

**Objetivo:** demostrar que la arquitectura admite contenido nuevo con cambios aislados.

- Segundo enemigo con comportamiento diferente (por ejemplo, forajido mecánico que mantiene distancia).
- Un enemigo con **dos ataques** seleccionables por distancia/cooldown/prioridad.
- Segundo patrón de ataque implementado (por ejemplo, cuerpo a cuerpo o ráfaga, según lo existente).
- Dos upgrades y dos perks demostrables, con datos configurables.
- Medir rendimiento con múltiples enemigos y proyectiles; optimizar solo cuellos de botella observados.
- Documentar procedimiento para añadir enemigo, ataque, arma, item y perk.

### Checklist

- [x] Nueva variante registrable por definición sin editar `Game.ts` ni un `switch` central.
- [x] Dos ataques en un mismo enemigo y selección correcta.
- [x] Nuevo contenido añadido mayoritariamente por configuración.
- [x] Regresión completa y build.
- [x] Documento de extensibilidad y limitaciones.
- [ ] Validación visual del usuario antes de cualquier fase posterior.

### Resultado de implementación 4F (validación visual del usuario pendiente)

- El rastrero y el forajido mecánico existentes cubren las dos estrategias y las variantes pedidas; el forajido selecciona plasma o golpe cercano por rango, cooldown y prioridad. No se duplicó contenido que ya cumplía el alcance.
- El check de extensibilidad registra una variante adicional por `EnemyDefinition` en un `EnemyManager` aislado y verifica ataques/upgrade/perk desde catálogos.
- `src/performance/Scale.check.ts` mide 49 instancias de enemigo y 80 proyectiles durante 60 ticks de 0.02 s. La última ejecución Playwright midió 35.00 ms; es una referencia del entorno, no un umbral de hardware. No se observó evidencia que justifique pooling u otra optimización.
- `docs/CONTENT_EXTENSION_GUIDE.md` documenta cómo añadir enemy, ataque, arma, loot y perk y describe límites actuales.
- Verificación ejecutada: build estricto correcto, con advertencia de Vite por chunk mayor de 500 kB. Checks agregados pasan: 116 estadísticas, 34 HUD, 29 habilidades, 31 combate, 44 enemigos, 43 loot, 12 muerte, 17 oleadas, 37 progresión, 1 integración de Game y 11 de extensibilidad.
- La Fase 4E continúa implementada y pendiente de validación visual. No se ha comenzado ninguna fase posterior.

---

## Ampliación de producto solicitada — menú y modos de partida

**Asignación:** ampliación directa solicitada por el usuario; no forma parte ni cambia el estado de 4E o 4F.

**Estado:** base funcional implementada; pendiente de validación en dispositivo móvil físico.

### Alcance implementado

- `ApplicationController` muestra el menú antes de crear `Game` o un renderer WebGL. Desde allí se accede a campaña, modo infinito, ajustes y logros; las vistas de resultados permiten reintentar o volver al menú.
- La campaña incluye tres capítulos jugables con desbloqueo local secuencial. Cada capítulo usa su propia escena, dos encuentros de oleadas, intermisión de progresión y un jefe con tres fases.
- El modo infinito genera oleadas en demanda a partir de las composiciones existentes. Aumenta cantidades y ritmo, amplía gradualmente el radio de aparición y limita a 12 los enemigos activos simultáneos. El récord local conserva máximos de oleada y puntuación.
- Ajustes persistentes para volúmenes independientes, música, calidad gráfica, sensibilidad de apuntado y controles táctiles; renderer y audio aplican sus preferencias.
- Los logros escuchan eventos del juego y guardan contadores/desbloqueos localmente.
- En pantallas táctiles se muestra un stick virtual de movimiento, una zona derecha de apuntado/disparo y botones de habilidades. El teclado y ratón siguen disponibles.
- Game Over y victoria notifican resultados, limpian la instancia de `Game` y permiten reiniciar el capítulo seleccionado sin perder ajustes, progreso de campaña, récords ni logros.

### Elementos provisionales y límites

- Música y efectos son síntesis Web Audio temporales, no pistas ni grabaciones finales; el audio se desbloquea con interacción del usuario.
- Música y efectos siguen siendo síntesis Web Audio temporales. Los nombres/IDs de audio de los bosses son placeholders procedurales, no grabaciones finales.
- El escalado infinito modifica cantidades, intervalos y radios, no las estadísticas individuales de enemigos. La puntuación provisional suma 100 por baja y 250 × oleada completada.
- El fondo del menú es arte procedimental Canvas 2D; no se añadieron ilustraciones ni archivos de audio finales.
- La validación táctil se hizo en emulación de navegador a 390 × 844; falta comprobar gestos, safe areas y ergonomía en teléfonos físicos.
- La calidad gráfica actual controla sombras y límite de pixel ratio; no ofrece perfiles detallados por plataforma.

### Verificación de esta ampliación

- `npm run build`: correcto; Vite conserva la advertencia del bundle minificado superior a 500 kB.
- Los checks actuales del producto están registrados al final de este roadmap; AV1–AV4 y GC1 conservan sus estados de validación previos.
- Navegación real: ajustes, persistencia de volumen, seis logros, selección/desbloqueo de capítulos y ausencia de Game/canvas WebGL antes de iniciar.
- Navegación real: modo infinito muestra `1 / ∞`; canvas Three.js no vacío en captura desktop y móvil; controles táctiles visibles y movimiento del stick comprobado; reinicio devuelve salud completa.
- La pestaña integrada puede pausar `requestAnimationFrame` cuando pierde foco. La transición Game Over y el render no vacío también se comprobaron con ticks controlados para evitar depender de esa limitación.

---

## Campaña — tres capítulos y jefes

**Asignación:** implementación completa solicitada por el usuario; no modifica Dash, costes de energía, tablas/probabilidades de loot ni los estados de validación AV1–AV4/GC1.

**Estado:** implementada y cubierta por checks deterministas y recorrido integrado de `Game`; pendiente de balance y validación visual/auditiva manual del usuario en una sesión normal y hardware objetivo.

### Contenido entregado

- `Pueblo Fantasma`: pueblo western existente, dos waves y El Sheriff de Hierro. Alterna revólver apuntado, ráfagas, lariat, abanico y carga.
- `Cañón de Cristal`: mesas/cristales y colisiones propias, dos waves y La Matriarca del Abismo. Usa proyectil apuntado, abanico, invocación limitada, radial y zona de colapso.
- `La Fundición Roja`: edificios/tanques industriales y colisiones propias, dos waves y El Predicador Carmesí. Usa proyectil, láser, invocación, radial y secuencia de patrones.
- Cada jefe tiene tres fases configurables por thresholds, modificadores de velocidad y listas de ataques; se procesan todos los thresholds cruzados por el mismo impacto. Windup/active/recovery/cooldown controlan anticipación, aplicación de daño y reutilización. RNG y objetivos son inyectables.
- Arenas visuales pulsantes con marcadores por jefe; HUD de salud/fase, introducciones, eventos de audio procedural y animación de derrota.
- `CampaignManager` coordina intro, waves, boss intro/fight, capítulo completo, siguiente capítulo, victoria y game-over. El menú desbloquea capítulos secuencialmente; reiniciar crea una run limpia.
- World y WaveManager se reconstruyen entre capítulos manteniendo referencias de obstáculos. RunState, vida/energía restantes, wallet, upgrades, perks, bajas y puntuación permanecen; las recompensas de jefe se aplican una sola vez. Los enemigos invocados se limpian al cambiar de capítulo.

### Verificación

- Build final: `npm run build` correcto. Sigue la advertencia conocida de Vite: chunk de `Game` de ~728 kB sin gzip (~188 kB gzip).
- Checks deterministas: 23 Boss (fases múltiples, referencias de ataques, patrones, tiempos de burst, cooldown, cancelación, daño, LoS, recompensas, modelo/arena, muerte/cleanup y navegación contra pared), 8 CampaignManager, 22 integración de campaña completa, 9 World/escenarios.
- Regresiones ejecutadas en navegador: 116 estadísticas, 34 HUD, 29 habilidades, 32 combate, 62 enemigos, 43 loot, 12 muerte, 25 waves, 37 progresión, 1 integración de progresión, 11 rendimiento, 5 F3, 12 VFX y 5 audio. La prueba integrada fuerza el combate para recorrer los tres capítulos; no mide duración ni dificultad humana.
- Playwright comprobó menú con tres capítulos (solo el primero inicialmente desbloqueado), creación del canvas WebGL, introducción del capítulo 1, estado `PREPARANDO`, HUD de vida/fase del Sheriff y arena en escena. Se revisó composición desktop y móvil; el selector y el overlay caben sin solape. El recorrido completo automatizado alcanza victoria y comprueba compra/persistencia/cambio de bioma.
- No se declara una duración estimada de campaña ni balance final. Falta que el usuario valide el ritmo, lectura de telegráfos, dificultad, mezcla y presentación de los tres bosses en una partida normal.

---

## Iteración audiovisual independiente — AV1 a AV4

**Asignación:** iteración solicitada de identidad audiovisual; no es una fase jugable nueva y no modifica los estados de 4E/4F.

**Estado:** AV1–AV4 implementadas, con corrección urgente de efectos y navegación; siguen pendientes de validación visual y auditiva del usuario.

### AV1 — Identidad visual y escenario

- `src/config/visualTheme.ts` centraliza paleta, luz de atardecer, parámetros de cristales/polvo y perfiles gráficos.
- El escenario conserva `World` y sus edificios, pero incorpora varias geometrías/materiales compartidos para rocas, carteles cian/magenta/azules con luz local, cristales cian/violeta pulsantes y una nube `THREE.Points` de polvo con un único draw call.
- Los perfiles limitan pixel ratio, sombras, luces locales, polvo y partículas. El polvo son puntos aditivos de 3.2 px a 0.9–5.4 unidades sobre el suelo; baja mantiene 20, media 56 y alta 150.
- Se conserva el modelo artesanal de `PlayerVisual`, la composición de enemigos y el CSS existente; sus materiales principales ahora toman colores de la paleta.

### AV2 — Efectos de combate

- `src/vfx/VisualEffectsSystem.ts` escucha eventos con posiciones reales y administra un batch acotado de partículas, billboard radial de flash y feedback de daño. El flash del jugador se adelanta 0.62 unidades al muzzle, mide 2.4 unidades mundiales y dura 360 ms; la prueba F3 dura 2 s.
- Se visualizan chispas de impacto, plasma, daño/bajas enemigas, daño del jugador, loot, pasos y Dash. El evento `projectile-spawned` da flash a disparos enemigos. Los proyectiles tienen núcleos visuales separados de su radio de colisión y estelas cónicas aditivas de 1.3–1.65 unidades que se eliminan al expirar o impactar.
- El sistema visual no participa en `DamageResolver`, detección de segmentos ni colliders. Presupuestos máximos: 48/144/288 partículas en baja/media/alta.
- Geometrías/materiales, listeners, overlays y líneas se liberan al destruir su propietario.
- Diagnóstico de la baja visibilidad anterior: el tamaño de puntos se trataba como perspectiva aunque la cámara es ortográfica; el polvo ambiental medía 0.11, su opacidad era 0.22 y podía quedar detrás del terreno; el flash duraba 55 ms y se reescalaba a 1.2–2.2 en cada update, anulando el pico; las estelas eran segmentos lineales de 1 px. El billboard radial ortográfico y el cono aditivo corrigen esas causas.

### AV3 — Música y efectos sonoros

- `src/audio/ProceduralMusicEngine.ts` genera loops originales con ruido ambiental filtrado, pads, bajo y percusión sintetizada; dos buses permiten crossfade de 1.4 s entre menú, exploración, combate, intermisión y Game Over.
- `AudioManager` sintetiza disparo, plasma, impactos, Dash, daño/muerte, ataques/muerte de enemigos, pickups, mejoras, perks, logros, oleadas y menú. Respeta gains independientes, desbloqueo por interacción, cooldowns y un máximo de 18 voces SFX activas.
- Enemigos y perks pueden proporcionar IDs sonoros propios. No hay grabaciones ni archivos de música finales; timbres, ruido y mezcla siguen siendo una implementación procedural provisional.

### AV4 — Interfaz, móviles y rendimiento

- Los tokens CSS alinean menú, HUD, ajustes, logros, intermisión y resultados sin reemplazar sus layouts personalizados; se añadieron transiciones discretas.
- Safe areas se conservan; el HUD se compacta arriba en móvil y landscape, los controles se reducen en pantallas bajas y se sugiere rotación en portrait.
- `ApplicationController` carga `Game` con `import()` al iniciar una partida: el build divide el entry inicial (~34 kB sin gzip) del chunk `Game` (~648 kB sin gzip). No se añadieron dependencias.

### Corrección de obstáculos y navegación

- La causa del atasco era navegación local greedy: solo aceptaba desvíos que redujeran distancia en cada paso, por lo que un obstáculo que exigía alejarse impedía rodearlo. Además, `Enemy.update()` no comprobaba LoS antes de llamar al controlador de ataques.
- Se generan 140 piedras decorativas; 15 superaban el umbral anterior de collider. En el área central se localizaron `Rock:16` (-13.88, -18.97), `Rock:61` (-14.91, 16.60) y la problemática `Rock:90` (-9.30, 10.87). Ahora solo rocas de tamaño >=0.7 son sólidas y su caja horizontal usa el 82% de la envolvente renderizada; F3 colorea rocas rojo, bases de cristal violeta y otras estructuras ámbar.
- `EnemyNavigation.ts` ejecuta A* en una ventana local acotada, infla obstáculos por radio, suaviza segmentos sin atravesarlos y replanifica cada 0.55 s o tras 0.28 s sin progreso. Enemigos melee y ranged seleccionan puntos de ataque con LoS; ranged no dispara a través de obstáculos. Las peticiones de spawn dentro de un collider buscan una alternativa libre.
- F3 expone colliders, rutas/waypoints, LoS, origen de efectos y trayectorias activas; incluye un botón para generar flash y polvo en una posición visible.

### Verificación

- `npm run build` pasa con carga diferida; Vite aún avisa que el chunk de `Game` supera 500 kB, aunque ya no bloquea la pantalla inicial.
- Checks visuales y de navegación añadidos: 8 VFX, 5 F3, 98 casos lógicos de navegación y más de 5,000 comprobaciones por frame de no penetración (incluidos `Rock:90`, spawn dentro de roca, movimiento melee y LoS/proyectil ranged). Las suites existentes de colisión/proyectiles pasan; el radio usado en colisión no cambia cuando aumenta el mesh visual.
- La emulación del navegador comprueba portrait y landscape, safe areas, controles, HUD sin solapes, render WebGL y la carga de `Game` tras iniciar.
- Playwright capturó colliders codificados por color, polvo, el botón F3 flash/polvo y el billboard del fogonazo. Un check de `Game` usa handlers reales de `PointerEvent`, WASD y Shift con ticks controlados: dos disparos, 8 nubes de movimiento y una activación de Dash. Se comprobó el framebuffer en la posición proyectada (558,342): intensidad máxima 255; la captura muestra el halo junto al arma.
- AV1–AV4 no están validadas por el usuario. Hace falta escuchar la mezcla en altavoces/auriculares y revisar VSM, proyectiles y efectos en hardware real.

---

## GC1 — Gameplay y combate dinámico

**Estado:** implementada y con checks técnicos; pendiente de validación visual del usuario. No añade armas, enemigos, mapas, granadas ni sistemas de progresión. Los estados de AV1–AV4 siguen pendientes; 4E/4F no cambian.

### GC1.1–GC1.2 — Feedback y fases de ataque

- Los números flotantes reutilizan un pool de 12 sprites/texturas, con límites 4/8/12 por calidad, ascenso/fade y daño efectivo (capado por salud restante). El jugador recibe flash y, cuando existe posición fuente, un indicador direccional proyectado por cámara.
- Cada ataque configurable sigue `windup → active → recovery → cooldown`. El crawler usa 0,34/0,12/0,42 s; el forajido plasma 0,55/0,28/0,45 s con ráfaga de 3 disparos cada 0,1 s. Melee solo aplica daño al entrar en `active`; ráfagas y cooldown respetan la configuración y LoS.
- Los modelos enemigos tienen aro/material de anticipación, flash de impacto y recoil en su grupo visual hijo; no desplazan el root ni cambian el collider.

### GC1.3–GC1.5 — Movimiento, muerte y balance

- Separación local evita solapes persistentes; los enemigos ranged orbitan a baja velocidad al mantener distancia. A* existente replanifica alrededor de obstáculos y el ataque se bloquea mientras LoS esté cerrado.
- Al morir, el manager quita inmediatamente el enemigo de `alive` y `CombatSystem`, emite una sola baja/loot y conserva solo la vista 0,38 s; su collider no se anima. Geometrías/materiales se liberan al finalizar.
- `src/config/enemyBalance.config.ts` centraliza salud, daño, velocidad, rango, separación y duraciones. La ráfaga de plasma reparte 9 de daño total; no se modificaron Dash ni sus costes.

### GC1.6–GC1.7 — Rendimiento y verificación

- Feedback reutiliza pools acotados, sprites/texturas reciclados y límites por perfil gráfico. F3 conserva sus funciones e incluye capas de colisión, ruta, LoS y proyectiles.
- `npm run build` pasa con TypeScript estricto. Regresiones finales: 32 combate, 62 enemigos, 98 casos lógicos + 5.872 comprobaciones por frame de navegación/colisión, 12 VFX y 5 de renderer F3; además todas las suites previas de habilidades, loot, stats, waves, progresión, audio y rendimiento.
- Playwright comprobó visualmente el aro de windup en escena y ejecutó un `Game` controlado por `PointerEvent`, WASD y Shift: un golpe melee activo, muerte/limpieza, dos disparos y Dash. AV1–AV4 y GC1 siguen pendientes de validación visual del usuario en una sesión normal y hardware objetivo.

---

## Catálogo experimental de enemigos elementales

**Asignación:** batería de prototipos solicitada; los enemigos son contenido de prueba y no forman parte del juego normal.

**Estado:** comportamientos y configuración implementados; 73 checks deterministas pasan; los 12 perfiles siguen pendientes de observación visual y balance. **Activados en partidas normales: ninguno.**

### Auditoría elemental

- Antes de esta sección, el juego solo declaraba `physical` y `plasma`. El color emisivo de un proyectil no determinaba su daño; no había resistencias, vulnerabilidades ni estados temporales.
- Se añadieron `fire`, `electric` y `cryo`, conservando `physical` como valor base. `DamageResolver` aplica multiplicadores elementales opcionales y estados declarados por el ataque. Las definiciones existentes no reciben elementos, estados ni cambios de daño.
- Estados y límites: burn renueva un único efecto con el DPS más alto, intervalo de 0,2–1 s, máximo 18 DPS y 8 s; slow renueva sin acumular, nunca baja de 45% de velocidad y dura como máximo 8 s; shock renueva con un máximo de 0,35 s. La descarga eléctrica no inmoviliza indefinidamente.
- Splash y chain son propiedades opcionales de `ProjectileDefinition.onImpact`, independientes de `damageType`. El electric chain limita objetivos totales (incluido el impacto inicial), registra los ya alcanzados y respeta LoS. Daño, impacto, aplicación de estado y VFX permanecen en eventos/sistemas separados.
- El artillero usa un proyectil parabólico visible y un punto bloqueado durante windup; el hazard resuelve el daño en ese punto al finalizar el aviso. Los hazards tienen intervalos de daño fijos, caps globales y por propietario, colisión/LoS y limpieza al morir, salvo detonaciones ya confirmadas con una zona finita persistente.

### Catálogo

| Nombre | Rol | Elemento | Ataques | Debilidad jugable | Cómo probarlo | Estado de validación |
|---|---|---|---|---|---|---|
| Forajido de chatarra | Tirador móvil | Físico | Abanico de 3 disparos, strafing y recarga | Electricidad, criogénico | `experimental-scrap-raider` | Checks automáticos; visual/balance pendientes |
| Embestidor blindado | Cargador acorazado | Físico | Línea telegráfica, carga bloqueable y recuperación | Criogénico, plasma; resistencia frontal finita | `experimental-armored-ram` | Checks automáticos; visual/balance pendientes |
| Artillero del páramo | Artillería | Físico | Proyectil parabólico y área retrasada en punto fijo | Electricidad, criogénico | `experimental-wasteland-gunner` | Checks automáticos; visual/balance pendientes |
| Incendiario de la fundición | Presión cercana | Fuego | Cono con windup, velocidad de giro acotada y burn | Criogénico, electricidad | `experimental-foundry-incendiary` | Checks automáticos; visual/balance pendientes |
| Escarabajo de escoria | Corredor suicida | Fuego | Fuse visible, explosión y zona temporal; muere antes de detonar | Criogénico, plasma | `experimental-scoria-beetle` | Checks automáticos; visual/balance pendientes |
| Chamán de ceniza | Control de espacio | Fuego | Tres zonas fijadas con retraso y cadencia limitada | Criogénico, físico | `experimental-ash-shaman` | Checks automáticos; visual/balance pendientes |
| Centinela de tormenta | Tirador de línea | Electricidad | Descarga lineal bloqueada por obstáculos | Físico, plasma | `experimental-storm-sentinel` | Checks automáticos; visual/balance pendientes |
| Tejedor de arcos | Constructor de hazards | Electricidad | Nodos destruibles, arco con LoS y needle con chain opcional | Físico, criogénico | `experimental-arc-weaver` | Checks automáticos; visual/balance pendientes |
| Sabueso voltaico | Asaltante veloz | Electricidad | Salto corto anticipado y descarga de aterrizaje | Criogénico, físico | `experimental-volt-hound` | Checks automáticos; visual/balance pendientes |
| Tirador de escarcha | Hostigador móvil | Criogénico | Abanico lento con huecos y slow limitado | Fuego, plasma | `experimental-frost-sharpshooter` | Checks automáticos; visual/balance pendientes |
| Excavador de cristal | Emboscador subterráneo | Criogénico | Recorrido bloqueable, marcador de salida y onda retrasada | Fuego, electricidad | `experimental-crystal-excavator` | Checks automáticos; visual/balance pendientes |
| Custodio de plasma | Élite lento | Plasma | Orbe explosivo y salva radial con huecos | Criogénico, electricidad | `experimental-plasma-custodian` | Checks automáticos; visual/balance pendientes |

### Arquitectura y activación

- `EXPERIMENTAL_ENEMY_DEFINITIONS` vive en `src/config/experimentalEnemies.config.ts`; no se concatena con `ENEMY_DEFINITIONS`, `WAVE_DEFINITIONS`, capítulos ni invocaciones de bosses.
- Cada perfil usa `EnemyManager`, `CombatSystem`, `DamageResolver` y `EnemyNavigation`; `ExperimentalAttackController` selecciona ataques desde datos y delega hazards limitados a `EnemyHazardManager`. `EnemyVisual` acepta piezas geométricas y telegráfos de línea, abanico, marcadores, anillo y subterráneo.
- La factoría `src/enemies/ExperimentalEnemyFactory.ts` exige contexto explícito `role + getTargets`; acepta `local`/`host`, rechaza `guest`, y crea un único enemigo por `create(id, position)`. No hay selector de desarrollo ni spawn automático.
- Límites de prueba: 12 prototipos vivos por factoría, 16 hazards globales, hazards/nodos limitados por perfil y 256 proyectiles activos globales. Fan, radial y burst validan también sus cantidades máximas.
- Ejemplo para un harness futuro:

```ts
const factory = new ExperimentalEnemyFactory(scene, world.obstacles, combat, {
  role: 'local',
  getTargets: () => [player],
  random: seededRandom,
})
const enemy = factory.create('experimental-scrap-raider', new THREE.Vector3(8, 0, 0))
factory.update(deltaTime)
factory.dispose()
```

- El repositorio contiene trabajo previo de transporte/rooms WebSocket, pero todavía no una simulación cooperativa autoritativa jugable. Esta tarea no añade integración de red; la factoría requiere autoridad y una lista de objetivos para preparar ese límite sin simular en invitados.

### Verificación y pendientes

- `npm run build`: correcto; Vite conserva su aviso existente de chunk `Game` superior a 500 kB.
- 73 checks deterministas ejecutados en navegador: catálogo/IDs, exclusión activa, resistencias/debilidades, stacking y caducidad de estados, stagger, cadencia de áreas, límite de hazards, LoS y nodos destruibles, splash/chain sin repeticiones, factoría solo por ID, autoridad, armadura frontal, fan de tres disparos, cancelación por cambio/desconexión/rango, fuse interrumpible/detonado, proyectil parabólico con punto bloqueado y ausencia de buffers de telegráfo en enemigos activos.
- No se añadió ningún ID a los conjuntos activos de enemigos, oleadas, campaña o summons de bosses. Dash, coste de energía, loot, balance de enemigos existentes y sus daños elementales permanecen sin cambios.
- La validación visual y de balance de los 12 enemigos queda pendiente. No se declaran observados ni activados en juego normal.

---

## Expansión de sistemas — dificultad, habilidades y capítulos 4–6

**Asignación:** ampliación directa solicitada por el usuario. No altera los estados históricos AV1–AV4, GC1 ni la exclusión del catálogo experimental; no incluye despliegue, commit o push.

**Estado:** implementación y checks técnicos completados; balance y validación visual/auditiva humana siguen pendientes.

### Dificultad

- `difficulty.config.ts` define Explorer, Normal, Veteran, Nightmare y Custom con rangos acotados, reacción mínima y límites de spawn/hazards. Normal es neutro.
- Ajustes persiste perfil y sliders custom con sanitización/migración para datos antiguos. El menú resume la selección antes de iniciar; los cambios durante una run se aplican al siguiente encuentro, no a una pelea ya iniciada.
- Escala por instancia de waves, enemigos, boss, cooldowns, telegráfos, proyectiles y recuperación de vida/energía. No muta definiciones base ni altera probabilidades de loot.

### Habilidades

- Catálogo de 12 entradas; 4 implementadas (Arco voltaico, Pulso de escarcha, Escudo de emergencia y Reserva auxiliar) y 8 explícitamente futuras.
- Progreso versionado en almacenamiento local; migración basada en capítulos efectivamente completados, desbloqueo único y loadout de 2 activas + 2 pasivas. No equipa contenido futuro/no implementado; Dash original permanece.
- Las cuatro funcionales comparten los sistemas de combate/estado existentes; el pasivo aplica un modificador reversible de la run.

### Campaña extendida

- La campaña original de tres capítulos se amplía secuencialmente a seis: Pantano de Esporas, Observatorio de Tormentas y Núcleo del Eclipse añaden tres waves cada uno y mapas diferenciados con landmarks/paleta propios.
- Nuevos bosses: Matriarca del Fango, Alguacil de la Tormenta y Fundidor del Eclipse; cada uno define tres fases, ataques y recompensas. El Alguacil usa enlaces eléctricos telegráfiados con nodos destruibles, límites de hazard y limpieza al cambiar de fase/morir.
- Los enemigos experimentales siguen fuera de waves/campaña/summons normales.

### Verificación y límites

- Checks deterministas ejecutados: 33 de dificultad/progresión e integración de habilidades; 13 de mapas; 28 de bosses; 9 de CampaignManager; 43 del recorrido integrado que fuerza los seis capítulos y confirma landmarks. La configuración contiene 15 waves reales; el harness acorta cada capítulo a una wave.
- Regresiones ejecutadas: 118 stats, 34 HUD, 12 muerte, 29 habilidades base, 32 combate, 62 enemigos, 5.872 navegación, 73 experimentales, 43 loot, 25 waves, 37 progresión, 1 integración de progresión, 1 ciclo de Game, 11 rendimiento, 5 F3, 8 touch, 12 VFX, 9 AppFeatures y 5 audio.
- `npm run build`: correcto. Vite conserva el aviso del chunk `Game` por encima de 500 kB.
- Vistas revisadas en navegador: Settings desktop 1280×720; catálogo 390×844 y 844×390; selector de capítulo en landscape. No hubo overflow horizontal. Sin dispositivo físico no se atribuye validación táctil de hardware.
- El balance humano, lectura visual/auditiva y progresión de las seis etapas siguen pendientes; la verificación automática de la secuencia no equivale a una partida equilibrada.

---

## 3. Contrato de entrega de cada fase para Copilot

Al finalizar **cada** fase, entregar:

1. Resumen de lo implementado y lista de archivos creados/modificados.
2. Diagrama o explicación de responsabilidades y flujo de datos.
3. Comandos ejecutados y resultados **reales** de build y checks (distinguir automatizados de manuales).
4. Guía de prueba en `npm run dev` y comportamiento esperado.
5. Riesgos, deuda técnica y decisiones de diseño.
6. Checklist actualizado; no avanzar sin aprobación explícita.

## 4. Próxima acción

**Próxima acción:** cerrar checks de dificultad/habilidades y recorrer los seis capítulos extendidos; revisar sus vistas desktop/móvil y registrar explícitamente lo que solo requiere validación humana. Después, volver a la validación visual del catálogo experimental, que permanece desactivado. 4E/4F, AV1–AV4 y GC1 conservan sus estados anteriores; la validación móvil física y la animación de muerte/reaparición siguen pendientes.
