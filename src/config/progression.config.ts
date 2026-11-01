import type { PerkDefinition, UpgradeDefinition } from '../progression/Progression.types'

const upgrades: UpgradeDefinition[] = [
  {
    id: 'revolver-damage',
    name: 'Plomo reforzado',
    description: '+5 de dano por disparo',
    cost: 25,
    maxLevel: 3,
    effects: [{ target: 'weapon', stat: 'damage', flat: 5 }],
  },
  {
    id: 'revolver-cadence',
    name: 'Mecanismo rapido',
    description: '+10% de cadencia',
    cost: 30,
    maxLevel: 3,
    requirements: [{ upgradeId: 'revolver-damage', level: 1 }],
    effects: [{ target: 'weapon', stat: 'shotsPerSecond', percentage: 0.1 }],
  },
  {
    id: 'max-health',
    name: 'Corazon de hierro',
    description: '+20 de salud maxima',
    cost: 20,
    maxLevel: 2,
    effects: [{ target: 'character', stat: 'maxHealth', flat: 20 }],
  },
]

export const UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = Object.freeze(upgrades.map((definition) => Object.freeze({
  ...definition,
  requirements: definition.requirements ? Object.freeze(definition.requirements.map((requirement) => Object.freeze({ ...requirement }))) : undefined,
  effects: Object.freeze(definition.effects.map((effect) => Object.freeze({ ...effect }))),
})))

const perks: PerkDefinition[] = [
  {
    id: 'iron-heart',
    name: 'Sangre de titanio',
    description: '+15 de salud maxima',
    stackingRule: 'unique',
    maxStacks: 1,
    sounds: { select: 'perk.iron-heart' },
    effects: [{ target: 'character', stat: 'maxHealth', flat: 15 }],
  },
  {
    id: 'quickdraw',
    name: 'Manos veloces',
    description: '+10% de cadencia del revolver',
    stackingRule: 'unique',
    maxStacks: 1,
    sounds: { select: 'perk.quickdraw' },
    effects: [{ target: 'weapon', stat: 'shotsPerSecond', percentage: 0.1 }],
  },
]

export const PERK_DEFINITIONS: readonly PerkDefinition[] = Object.freeze(perks.map((definition) => Object.freeze({
  ...definition,
  effects: Object.freeze(definition.effects.map((effect) => Object.freeze({ ...effect }))),
})))

export const PERK_CHOICES_PER_INTERMISSION = 1