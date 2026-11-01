import type { DamageStatusApplication, DamageType } from '../combat/Combat.types'

export type SkillCategory = 'active' | 'passive'
export type SkillImplementation = 'implemented' | 'future'

export interface SkillDefinition {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: SkillCategory
  readonly damageType?: DamageType
  readonly energyCost: number
  readonly cooldownSeconds: number
  readonly durationSeconds: number
  readonly range: number
  readonly areaRadius: number
  readonly prerequisites: readonly string[]
  readonly parameters: Readonly<Record<string, number>>
  readonly statusEffects: readonly DamageStatusApplication[]
  readonly accumulation: 'none' | 'refresh-strongest' | 'limited-unique'
  readonly multiplayerCompatibility: 'single-player-only' | 'host-authority-pending'
  readonly implementation: SkillImplementation
}

const active = (
  id: string,
  name: string,
  description: string,
  damageType: DamageType | undefined,
  energyCost: number,
  cooldownSeconds: number,
  durationSeconds: number,
  range: number,
  areaRadius: number,
  chapter: string,
  parameters: Readonly<Record<string, number>>,
  statusEffects: readonly DamageStatusApplication[] = [],
  implementation: SkillImplementation = 'future',
): SkillDefinition => ({
  id, name, description, category: 'active', damageType, energyCost, cooldownSeconds, durationSeconds, range, areaRadius,
  prerequisites: [chapter], parameters, statusEffects, accumulation: 'none',
  multiplayerCompatibility: 'host-authority-pending', implementation,
})

const passive = (
  id: string,
  name: string,
  description: string,
  chapter: string,
  parameters: Readonly<Record<string, number>>,
  implementation: SkillImplementation = 'future',
): SkillDefinition => ({
  id, name, description, category: 'passive', energyCost: 0, cooldownSeconds: 0, durationSeconds: 0, range: 0, areaRadius: 0,
  prerequisites: [chapter], parameters, statusEffects: [], accumulation: 'limited-unique',
  multiplayerCompatibility: 'host-authority-pending', implementation,
})

export const SKILL_CATALOG: readonly SkillDefinition[] = Object.freeze([
  active('ash-step', 'Paso de ceniza', 'Dash basico que deja una estela de fuego temporal; no concede invulnerabilidad.', 'fire', 20, 2, 0.18, 30, 0.7, 'ghost-town', { trailSeconds: 1.4, trailDamage: 4, sharesDashMovement: 1 }),
  active('arc-voltaic', 'Arco voltaico', 'Descarga a un enemigo y encadena hasta dos saltos a objetivos distintos con linea de vision.', 'electric', 32, 8, 0.12, 9, 0, 'ghost-town', { firstDamage: 22, chainDamageMultiplier: 0.65, maxTargets: 3 }, [{ type: 'shock', staggerSeconds: 0.14 }], 'implemented'),
  active('frost-pulse', 'Pulso de escarcha', 'Onda cercana de dano criogenico que ralentiza sin acumular hasta inmovilizar.', 'cryo', 28, 9, 0.18, 4.5, 4.5, 'red-foundry', { damage: 16, slowMultiplier: 0.7, slowSeconds: 1.5 }, [{ type: 'slow', durationSeconds: 1.5, movementMultiplier: 0.7 }], 'implemented'),
  active('plasma-core', 'Nucleo de plasma', 'Proyectil lento con una explosion de area que aplica dano una vez por objetivo.', 'plasma', 34, 10, 0.18, 18, 2.8, 'ghost-town', { projectileDamage: 26, splashMultiplier: 0.7, maxTargets: 8 }),
  active('deputy-drone', 'Dron alguacil', 'Companero temporal con linea de vision y limite de un dron por jugador.', 'physical', 36, 16, 8, 12, 0, 'crystal-canyon', { damagePerShot: 7, shotsPerSecond: 1.2, maxDrones: 1 }),
  active('hologram-decoy', 'Senuelo holografico', 'Desvia la atencion de enemigos compatibles; los jefes solo se distraen brevemente.', undefined, 26, 14, 4, 8, 2, 'crystal-canyon', { bossTauntSeconds: 0.6, normalTauntSeconds: 3.2 }),
  active('emergency-shield', 'Escudo de emergencia', 'Absorbe una cantidad limitada de dano durante cuatro segundos.', undefined, 30, 13, 4, 0, 0, 'spore-swamp', { capacity: 42 }, [], 'implemented'),
  active('gravity-well', 'Pozo gravitatorio', 'Ralentiza y atrae suavemente enemigos normales; obstaculos y resistencias limitan el empuje.', undefined, 38, 17, 3.5, 8, 4, 'storm-observatory', { pullSpeed: 1.1, slowMultiplier: 0.78, eliteDisplacementMultiplier: 0.3 }),
  passive('scavenger', 'Carroñero', 'Aumenta moderadamente el radio de recogida y recursos recuperables, con limites.', 'crystal-canyon', { pickupRadiusMultiplier: 1.2, recoveryMultiplier: 1.12 }),
  passive('auxiliary-reserve', 'Reserva auxiliar', 'Aumenta energia maxima mediante un modificador reversible de la partida.', 'crystal-canyon', { maxEnergyFlat: 24 }, 'implemented'),
  passive('reactive-armor', 'Armadura reactiva', 'Reduce temporalmente el siguiente golpe; el cooldown interno evita acumulacion.', 'storm-observatory', { damageReduction: 0.25, durationSeconds: 1.2, cooldownSeconds: 7 }),
  passive('element-specialist', 'Especialista elemental', 'Mejora un elemento elegido, no todos simultaneamente.', 'eclipse-core', { selectedDamageMultiplier: 1.12 }),
])

export const SKILLS_BY_ID = new Map(SKILL_CATALOG.map((skill) => [skill.id, skill]))
export const SKILL_UNLOCK_BY_CHAPTER: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'ghost-town': ['arc-voltaic'],
  'crystal-canyon': ['auxiliary-reserve'],
  'red-foundry': ['frost-pulse'],
  'spore-swamp': ['emergency-shield'],
})
