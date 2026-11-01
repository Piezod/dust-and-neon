# Guia de extensibilidad de Dust & Neon

Esta guia describe los puntos de extension que existen en el codigo de las fases 4A-4F. Los datos globales son de solo lectura; cada partida crea instancias de enemigos, combate y progresion.

## Anadir un enemigo

1. Anade una `EnemyDefinition` inmutable a `src/config/enemies.config.ts`: `id`, salud, velocidad, radios, deteccion, visual, comportamiento, ataques y `lootTableId` opcional.
2. Para las estrategias existentes usa `behavior.type: 'chase'` o `'keep-distance'` y sus parametros. `EnemyManager` crea una estrategia nueva para cada instancia.
3. Anade un `WaveSpawnGroup` en `src/config/waves.config.ts` para incluir el enemigo en una oleada.
4. Comprueba que sus rangos de ataque y radio tienen sentido y ejecuta `runEnemyChecks()`.

Las instancias comparten la definicion inmutable, no la salud, el cooldown ni la posicion. El visual actual escoge entre la forma rastrera y humanoide usando la altura configurada; una silueta nueva requiere ampliar `EnemyVisual`.

## Anadir un ataque enemigo

Cada `EnemyDefinition.attacks` es una lista. Un ataque declara ID, tipo, rango minimo/maximo, cooldown, prioridad y dano.

- Un ataque `melee` usa el executor registrado en `src/enemies/EnemyAttackController.ts` y `CombatSystem.applyDamage()`.
- Un ataque `projectile` incluye su `ProjectileDefinition`; `CombatSystem.spawnProjectile()` reutiliza movimiento, barrido de impactos, facciones y limpieza de 4A.
- Si dos ataques validos tienen la misma distancia, el controlador elige primero la prioridad mas alta y despues el ID en orden lexical.
- Los tipos `area` y `special` estan tipados pero no tienen executor todavia; no se seleccionan hasta registrar un executor real.

Para introducir un nuevo tipo, agrega un executor al registry `ATTACK_EXECUTORS`, no un `switch` por enemigo. Ejecuta las pruebas de cooldown, seleccion, faccion e impacto.

## Anadir un arma o mejorar el revolver

`src/config/combat.config.ts` contiene `REVOLVER_ATTACK`, que no se muta durante la partida. El `AttackController` posee modifiers runtime por instancia con ID; para ajustes temporales, los upgrades de 4E apuntan al target `weapon` mediante `ProgressionEffectApplier`.

Una segunda arma debe tener una definicion `AttackDefinition` propia y una instancia de `AttackController`/`CombatSystem` apropiada. La composicion actual de Game registra un revolver; el inventario/equipamiento de armas no forma parte de estas fases.

## Anadir un tipo de loot

`LootRewardType` esta en `src/loot/Loot.types.ts`. Para un tipo recogible nuevo:

1. Anade el literal al union `LootRewardType`.
2. Define cantidad y comportamiento en una tabla de `src/config/loot.config.ts`.
3. Anade la aplicacion del efecto en `LootRewardResolver`.
4. Anade una forma Three.js propia en `LootVisual` y cubre recogida, muerte, no duplicacion y dispose en `Loot.check.ts`.

Las tablas no conocen Three.js. `LootRoller` recibe una fuente RNG y devuelve resultados de dominio; `LootManager` convierte cada resultado en un pickup y lo coloca en un punto libre cercano.

## Anadir una mejora o perk

Edita `src/config/progression.config.ts`:

- `UpgradeDefinition` establece ID, coste por nivel, nivel maximo, requisitos y effects. Los efectos `character` van a `CharacterStats`; los efectos `weapon` modifican la instancia del revolver.
- `PerkDefinition` define effects y stacking `unique` o `stackable`, con `maxStacks` explicito. Actualmente se puede elegir un perk por intermission (`PERK_CHOICES_PER_INTERMISSION`).
- `IntermissionPanel` crea las filas desde esos catalogos; no codifica nombres/efectos en `Game`.

`UpgradeManager` gasta oro solo despues de validar estado, requisitos y nivel. `RunState.reset()` revierte los modifiers y vacia la Wallet de partida; una nueva instancia de Game/RunState empieza de cero.

## Rendimiento y limites

`runExtensibilityAndPerformanceChecks()` en `src/performance/Scale.check.ts` ejecuta una muestra determinista con 49 enemigos y 80 proyectiles durante 60 ticks de 0.02 s, y devuelve el tiempo medido sin imponer un limite dependiente del hardware. En la ejecucion Playwright de 4F midio 35.00 ms. Sirve para comparar cambios en el mismo entorno; no mide de forma aislada todas las fases de render WebGL ni sustituye un perfil de una partida real.

La navegacion enemiga es steering local con subpasos y `Box2`; no hay pathfinding global. No se optimiza por pooling mientras no se mida un cuello de botella. Geometrias/materiales de pickups y enemigos se liberan al retirar cada instancia.
