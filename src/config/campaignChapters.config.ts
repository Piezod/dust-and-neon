import type { CampaignChapterContent } from '../game-modes/CampaignChapter.types'
import type { WaveDefinition } from '../waves/Wave.types'

const wave = (id: string, crawlerCount: number, outlawCount: number, preparationSeconds: number, intervalSeconds: number): WaveDefinition => ({
  id,
  preparationSeconds,
  completionSeconds: 1.1,
  upgradesSeconds: 24,
  spawnRadiusMin: 11,
  spawnRadiusMax: 16,
  spawnAttempts: 16,
  spawnGroups: [
    { enemyId: 'alien-crawler', count: crawlerCount, intervalSeconds },
    { enemyId: 'mechanical-outlaw', count: outlawCount, intervalSeconds: intervalSeconds + 0.25 },
  ],
})

const chapter = (
  id: string,
  title: string,
  intro: string,
  worldScenario: CampaignChapterContent['worldScenario'],
  bossId: string,
  waves: readonly WaveDefinition[],
  bossPosition: readonly [number, number, number],
): CampaignChapterContent => ({
  id,
  title,
  intro,
  worldScenario,
  bossId,
  waves,
  bossPosition,
  missions: [{ id, title, provisional: false }],
})

export const CAMPAIGN_CHAPTERS: readonly CampaignChapterContent[] = Object.freeze([
  chapter(
    'ghost-town',
    'Pueblo Fantasma',
    'Las luces de Last Light vuelven a encenderse. El Sheriff de Hierro ha cerrado la calle principal.',
    'ghost-town',
    'iron-sheriff',
    [wave('ghost-town-outskirts', 4, 1, 3, 0.75), wave('ghost-town-main-street', 5, 2, 2, 0.62)],
    [0, 0, 12],
  ),
  chapter(
    'crystal-canyon',
    'Cañón de Cristal',
    'Las vetas del cañón laten bajo tierra. Algo enorme responde desde el abismo.',
    'crystal-canyon',
    'abyss-matriarch',
    [wave('crystal-canyon-ridge', 5, 2, 3, 0.68), wave('crystal-canyon-depths', 6, 3, 2, 0.55)],
    [0, 0, -12],
  ),
  chapter(
    'red-foundry',
    'La Fundición Roja',
    'Las chimeneas de la fundición vuelven a arder. El Predicador Carmesí espera junto al reactor.',
    'red-foundry',
    'crimson-preacher',
    [wave('red-foundry-yard', 6, 3, 3, 0.6), wave('red-foundry-reactor', 7, 4, 2, 0.5)],
    [0, 0, 12],
  ),
  chapter(
    'spore-swamp',
    'Pantano de Esporas',
    'Las pasarelas atraviesan un mar de esporas. La Matriarca del Fango protege el corazon del pantano.',
    'spore-swamp',
    'mud-matriarch',
    [wave('spore-swamp-lowland', 6, 2, 3, 0.66), wave('spore-swamp-causeway', 7, 3, 2.5, 0.58), wave('spore-swamp-heart', 8, 3, 2, 0.52)],
    [0, 0, -14],
  ),
  chapter(
    'storm-observatory',
    'Observatorio de Tormentas',
    'Las antenas desatan pulsos sobre las explanadas. El Alguacil de la Tormenta vigila desde la torre.',
    'storm-observatory',
    'storm-marshal',
    [wave('storm-observatory-yard', 7, 3, 3, 0.62), wave('storm-observatory-relays', 8, 4, 2.5, 0.55), wave('storm-observatory-spire', 9, 4, 2, 0.48)],
    [0, 0, 14],
  ),
  chapter(
    'eclipse-core',
    'Nucleo del Eclipse',
    'El complejo alienigena se abre en una arena circular. El Fundidor del Eclipse guarda la salida.',
    'eclipse-core',
    'eclipse-smelter',
    [wave('eclipse-core-approach', 8, 4, 3, 0.58), wave('eclipse-core-ring', 9, 5, 2.5, 0.5), wave('eclipse-core-heart', 10, 5, 2, 0.45)],
    [0, 0, -14],
  ),
])
