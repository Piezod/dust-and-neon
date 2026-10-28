# CharacterStats: fase 3A

## Archivos

- `src/core/CharacterStats.types.ts`: valores, claves y modificadores tipados.
- `src/config/player.config.ts`: valores base centralizados; velocidad original 5.5.
- `src/core/CharacterStats.ts`: recursos y estadisticas reutilizables, sin Three.js.
- `src/entities/Player.ts`: composicion mediante `player.stats`; `player.speed` es un getter compatible que consulta la velocidad efectiva.
- `src/core/CharacterStats.check.ts`: comprobacion manual, no importada por el juego.

## Contrato

Cada estadistica se calcula como `(base + suma plana) * (1 + suma porcentual)`.
Los porcentajes se expresan como fraccion: `0.2` significa 20%. No se multiplican entre si.
Se ordenan los modificadores por `id` antes de sumar, para que el resultado no dependa del orden de insercion, incluso con aritmetica de coma flotante.
Los valores base y los modificadores se copian para impedir cambios externos.
Los identificadores son unicos en cada instancia; insertar un duplicado lanza un error.
Retirar un identificador inexistente devuelve `false` sin cambiar nada.

Todos los valores efectivos tienen minimo cero y `criticalChance` tambien tiene maximo uno.
Los valores base finitos fuera de esos limites se limitan al calcular los efectivos, sin modificar la base.
Los importes negativos, NaN e infinitos se rechazan con `RangeError` sin modificar recursos.
Los modificadores admiten importes negativos para reducciones y se rechazan si producen resultados no finitos.
Al retirar una reduccion se recupera la estadistica, pero no los recursos ya perdidos.

Vida y energia comienzan en sus maximos. Al cambiar maximos solo se recortan los recursos actuales si superan el nuevo limite: nunca se rellenan automaticamente.
`spendEnergy` devuelve `false` sin gastar nada cuando falta energia; devuelve `true` si puede pagar todo el importe.
`takeDamage` aplica dano directo, sin usar defensa ni probabilidad critica: la formula de combate queda fuera de esta fase.
No hay regeneracion, disparos, UI ni nuevas dependencias.

## Ejemplos

Con una instancia existente de Player:

```ts
player.stats.addModifier({
  id: 'speed-20',
  stat: 'moveSpeed',
  percentage: 0.2,
})
// player.speed: 6.6
player.stats.removeModifier('speed-20')
// player.speed: 5.5

player.stats.takeDamage(30)
player.stats.heal(10)
// Vida inicial 100: currentHealth = 80
```

## Comprobacion Manual Sin Framework

1. Ejecutar `npm run build` para verificar TypeScript y el bundle.
2. Ejecutar `npm run dev` y abrir la URL indicada por Vite.
3. Sin mantener teclas pulsadas, ejecutar en la consola del navegador:

```js
const { runCharacterStatsChecks } = await import('/src/core/CharacterStats.check.ts')
runCharacterStatsChecks()
```

Debe devolver un mensaje `checks passed`; cualquier fallo lanza un error con su motivo.
Puede repetirse la llamada. Se comprueban formula, orden, reversibilidad, copias,
limites, entradas invalidas, recursos, maxima sin relleno, velocidad 5.5/6.6/0,
WASD, diagonales y apuntado mediante PlayerController.
Las instancias temporales no se renderizan y se liberan al finalizar.
No existe script de tests ni framework de pruebas en este proyecto.