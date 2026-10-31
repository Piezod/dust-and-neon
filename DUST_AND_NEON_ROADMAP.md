# Dust & Neon — Roadmap de desarrollo del núcleo roguelike

**Versión:** 1.0 · **Estado:** Fases 4A, 4B y 4C validadas por el usuario; 4D implementada y pendiente de validación visual.

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
| 4D · Oleadas | Spawns progresivos y fin de oleada | 🟨 Implementada; pendiente de validación visual del usuario |
| 4E · Mejoras | Pantalla entre oleadas, oro, upgrades y perks | ⬜ Pendiente |
| 4F · Extensibilidad | Segundo enemigo, ataques alternativos y balance | ⬜ Pendiente |

Para cada fase, Copilot debe actualizar la tabla y checklist **solo tras** completar los criterios de aceptación y recibir confirmación.

---

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

### Resultado de implementación 4D (validación visual del usuario pendiente)

- `src/waves/` contiene tipos, `WaveManager` y checks; `src/config/waves.config.ts` define dos composiciones configurables.
- `WaveManager` coordina `preparation` → `combat` → `completed` → `upgrades` → siguiente ola; entra en `game-over` al morir el jugador. El estado `upgrades` es una intermisión sin tienda ni compras.
- Los enemigos se generan progresivamente por grupo. `EnemyManager.trySpawn()` busca posiciones despejadas con radio seguro; se limita el número de intentos y, si fallan, se omite y contabiliza ese spawn.
- El HUD muestra oleada y enemigos restantes. No se simulan enemigos, loot ni movimiento durante `upgrades`; el estado `game-over` bloquea input y nuevos spawns.
- El estado de muerte procede de `CharacterStats.isAlive` (`currentHealth > 0`), no de un booleano duplicado. `spendEnergy`, `Ability.activate`, `AbilityManager.cancelAll`, `PlayerController` y `CombatSystem` rechazan o cancelan acciones del jugador muerto. Los proyectiles ya existentes pueden continuar; se bloquea la creación de nuevos proyectiles del jugador.
- Checks ejecutados: 116 estadísticas, 34 HUD, 29 habilidades, 31 combate, 44 enemigos, 43 loot, 12 de muerte y 17 de oleadas. Build estricto correcto; Vite conserva su advertencia por chunk mayor de 500 kB.
- Pendientes sin fase asignada: pantalla Game Over, animación de muerte, menú de reinicio y reaparición. No se implementaron.
- Pendiente la validación visual del usuario antes de iniciar 4E.

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

- [ ] Comprar solo con saldo suficiente.
- [ ] Mejoras alteran parámetros reales de combate.
- [ ] Sin modificar definiciones compartidas.
- [ ] Perks aplicados una sola vez según reglas de apilamiento.
- [ ] Reiniciar partida restablece progresión temporal.
- [ ] Build, pruebas y aprobación.

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

- [ ] Nueva variante sin editar un `switch` central.
- [ ] Dos ataques en un mismo enemigo y selección correcta.
- [ ] Nuevo contenido añadido mayoritariamente por configuración.
- [ ] Regresión completa y build.
- [ ] Documento de extensibilidad y limitaciones.

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

**Esperar validación visual del usuario de la Fase 4D.** No iniciar 4E hasta su aprobación. La pantalla Game Over, animación de muerte, menú de reinicio y reaparición siguen pendientes sin asignación de fase.
