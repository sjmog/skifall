export interface Point {
  x: number;
  y: number;
}

export type LevelFeatureKind = 'solid' | 'scenery';

export interface LevelFeature {
  id: string;
  kind: LevelFeatureKind;
  points: Point[];
}

export const DEFAULT_LEVEL_OWNER = 'ADMIN';
const DEFAULT_LEVEL_VERSION = 1;
const INITIAL_LEVEL_BANK_DATE = '2026-05-30';

export type LevelDifficulty = 'easy' | 'medium' | 'hard';
export type LevelStatus = 'unfinished' | 'finished' | 'draft' | 'published' | 'archived';

export interface LevelImage {
  src: string;
  alt: string;
  kind: 'full-level-screenshot';
}

export interface LevelMetadata {
  levelId: string;
  name: string;
  image: LevelImage;
  owners: string[];
  difficulty?: LevelDifficulty;
  status: LevelStatus;
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  description?: string;
}

export interface LevelData {
  start: Point;
  finish: Point;
  blackLines: LevelFeature[];
  greyLines: LevelFeature[];
}

export interface PregeneratedLevelTemplate {
  id: string;
  name: string;
  owners: string[];
  difficulty: LevelDifficulty;
  metadata: LevelMetadata;
  start: Point;
  finish: Point;
  features: LevelFeature[];
}

const solid = (id: string, points: Point[]): LevelFeature => ({ id, kind: 'solid', points });
const scenery = (id: string, points: Point[]): LevelFeature => ({ id, kind: 'scenery', points });

type LevelTemplateSeed = Omit<PregeneratedLevelTemplate, 'owners' | 'metadata'> & {
  owners?: string[];
  metadata?: Partial<Omit<LevelMetadata, 'levelId' | 'name' | 'owners' | 'difficulty'>>;
};

const levelTemplate = ({
  owners = [DEFAULT_LEVEL_OWNER],
  metadata,
  ...template
}: LevelTemplateSeed): PregeneratedLevelTemplate => {
  const image = metadata?.image ?? getDefaultLevelImage(template.id, template.name);

  return {
    ...template,
    owners,
    metadata: {
      levelId: template.id,
      name: template.name,
      image,
      owners,
      difficulty: template.difficulty,
      status: metadata?.status ?? 'published',
      version: metadata?.version ?? DEFAULT_LEVEL_VERSION,
      tags: metadata?.tags ?? [],
      createdAt: metadata?.createdAt ?? INITIAL_LEVEL_BANK_DATE,
      updatedAt: metadata?.updatedAt ?? INITIAL_LEVEL_BANK_DATE,
      description: metadata?.description,
    },
  };
};

export function getDefaultLevelImage(levelId: string, levelName: string): LevelImage {
  return {
    src: `/levels/${levelId}/full-level.png`,
    alt: `${levelName} full level screenshot`,
    kind: 'full-level-screenshot',
  };
}

export function getLevelData(template: PregeneratedLevelTemplate): LevelData {
  return {
    start: template.start,
    finish: template.finish,
    blackLines: template.features.filter((feature) => feature.kind === 'solid'),
    greyLines: template.features.filter((feature) => feature.kind === 'scenery'),
  };
}

export function getLevelMetadata(template: PregeneratedLevelTemplate): LevelMetadata {
  return {
    ...template.metadata,
    image: { ...template.metadata.image },
    owners: [...template.metadata.owners],
    tags: [...template.metadata.tags],
  };
}

export function getLevelsByDifficulty(
  difficulty: LevelDifficulty
): PregeneratedLevelTemplate[] {
  return PREGENERATED_LEVELS.filter((level) => level.difficulty === difficulty);
}

export const PREGENERATED_LEVELS: PregeneratedLevelTemplate[] = [
  levelTemplate({
    id: 'alpine-s-curves',
    name: 'Alpine S-Curves',
    difficulty: 'easy',
    start: { x: 320, y: 135 },
    finish: { x: 1540, y: 1325 },
    features: [
      solid('alpine-s-curves-shelf-1', [{ x: 240, y: 205 }, { x: 570, y: 315 }, { x: 785, y: 390 }]),
      solid('alpine-s-curves-shelf-2', [{ x: 760, y: 535 }, { x: 530, y: 675 }, { x: 335, y: 820 }]),
      solid('alpine-s-curves-shelf-3', [{ x: 555, y: 900 }, { x: 900, y: 1000 }, { x: 1210, y: 1135 }]),
      solid('alpine-s-curves-landing', [{ x: 1270, y: 1210 }, { x: 1505, y: 1285 }, { x: 1690, y: 1305 }]),
      scenery('alpine-s-curves-ridge-1', [{ x: 170, y: 280 }, { x: 360, y: 230 }, { x: 560, y: 270 }]),
      scenery('alpine-s-curves-ridge-2', [{ x: 920, y: 720 }, { x: 1100, y: 640 }, { x: 1280, y: 700 }]),
    ],
  }),
  levelTemplate({
    id: 'glacier-steps',
    name: 'Glacier Steps',
    difficulty: 'easy',
    start: { x: 1180, y: 120 },
    finish: { x: 560, y: 1330 },
    features: [
      solid('glacier-steps-upper', [{ x: 1110, y: 215 }, { x: 875, y: 305 }, { x: 690, y: 420 }]),
      solid('glacier-steps-kicker', [{ x: 570, y: 535 }, { x: 765, y: 630 }, { x: 930, y: 720 }]),
      solid('glacier-steps-wall', [{ x: 1010, y: 720 }, { x: 1065, y: 850 }, { x: 1110, y: 995 }]),
      solid('glacier-steps-runout', [{ x: 910, y: 1025 }, { x: 705, y: 1160 }, { x: 510, y: 1290 }]),
      scenery('glacier-steps-crevasse-1', [{ x: 315, y: 605 }, { x: 510, y: 575 }, { x: 690, y: 600 }]),
      scenery('glacier-steps-crevasse-2', [{ x: 1210, y: 1010 }, { x: 1395, y: 950 }, { x: 1580, y: 1015 }]),
    ],
  }),
  levelTemplate({
    id: 'pine-chute',
    name: 'Pine Chute',
    difficulty: 'easy',
    start: { x: 465, y: 155 },
    finish: { x: 1390, y: 1295 },
    features: [
      solid('pine-chute-entry', [{ x: 390, y: 255 }, { x: 610, y: 360 }, { x: 790, y: 480 }]),
      solid('pine-chute-left-bank', [{ x: 740, y: 565 }, { x: 560, y: 690 }, { x: 470, y: 835 }]),
      solid('pine-chute-spine', [{ x: 820, y: 715 }, { x: 950, y: 850 }, { x: 1085, y: 990 }]),
      solid('pine-chute-final', [{ x: 990, y: 1100 }, { x: 1215, y: 1215 }, { x: 1455, y: 1280 }]),
      scenery('pine-chute-trees-1', [{ x: 900, y: 390 }, { x: 980, y: 350 }, { x: 1060, y: 390 }]),
      scenery('pine-chute-trees-2', [{ x: 230, y: 840 }, { x: 315, y: 790 }, { x: 420, y: 825 }]),
      scenery('pine-chute-trees-3', [{ x: 1380, y: 920 }, { x: 1495, y: 875 }, { x: 1600, y: 920 }]),
    ],
  }),
  levelTemplate({
    id: 'switchback-bowl',
    name: 'Switchback Bowl',
    difficulty: 'medium',
    start: { x: 1540, y: 145 },
    finish: { x: 430, y: 1310 },
    features: [
      solid('switchback-bowl-top', [{ x: 1450, y: 245 }, { x: 1180, y: 330 }, { x: 920, y: 435 }]),
      solid('switchback-bowl-middle', [{ x: 845, y: 545 }, { x: 1050, y: 650 }, { x: 1265, y: 790 }]),
      solid('switchback-bowl-return', [{ x: 1165, y: 920 }, { x: 890, y: 1015 }, { x: 620, y: 1140 }]),
      solid('switchback-bowl-runout', [{ x: 585, y: 1205 }, { x: 420, y: 1275 }, { x: 260, y: 1320 }]),
      scenery('switchback-bowl-backwall', [{ x: 575, y: 260 }, { x: 760, y: 205 }, { x: 980, y: 250 }]),
      scenery('switchback-bowl-shadow', [{ x: 1360, y: 950 }, { x: 1540, y: 890 }, { x: 1700, y: 950 }]),
    ],
  }),
  levelTemplate({
    id: 'powder-gully',
    name: 'Powder Gully',
    difficulty: 'medium',
    start: { x: 850, y: 120 },
    finish: { x: 1010, y: 1340 },
    features: [
      solid('powder-gully-rail-left', [{ x: 600, y: 260 }, { x: 705, y: 480 }, { x: 805, y: 700 }]),
      solid('powder-gully-rail-right', [{ x: 1105, y: 285 }, { x: 1020, y: 520 }, { x: 940, y: 735 }]),
      solid('powder-gully-jump', [{ x: 760, y: 815 }, { x: 930, y: 920 }, { x: 1110, y: 1010 }]),
      solid('powder-gully-catcher', [{ x: 1125, y: 1115 }, { x: 970, y: 1220 }, { x: 830, y: 1305 }]),
      scenery('powder-gully-snowfield-1', [{ x: 355, y: 560 }, { x: 485, y: 505 }, { x: 615, y: 555 }]),
      scenery('powder-gully-snowfield-2', [{ x: 1225, y: 735 }, { x: 1385, y: 690 }, { x: 1525, y: 730 }]),
    ],
  }),
  levelTemplate({
    id: 'ridge-traverse',
    name: 'Ridge Traverse',
    difficulty: 'medium',
    start: { x: 250, y: 175 },
    finish: { x: 1695, y: 1290 },
    features: [
      solid('ridge-traverse-entry', [{ x: 190, y: 255 }, { x: 455, y: 340 }, { x: 720, y: 430 }]),
      solid('ridge-traverse-spine', [{ x: 805, y: 565 }, { x: 690, y: 730 }, { x: 585, y: 900 }]),
      solid('ridge-traverse-bridge', [{ x: 735, y: 915 }, { x: 1035, y: 1010 }, { x: 1325, y: 1115 }]),
      solid('ridge-traverse-finish', [{ x: 1340, y: 1195 }, { x: 1555, y: 1260 }, { x: 1760, y: 1305 }]),
      scenery('ridge-traverse-peak-1', [{ x: 900, y: 310 }, { x: 1035, y: 240 }, { x: 1190, y: 310 }]),
      scenery('ridge-traverse-peak-2', [{ x: 215, y: 970 }, { x: 405, y: 910 }, { x: 570, y: 965 }]),
    ],
  }),
  levelTemplate({
    id: 'icefall-slalom',
    name: 'Icefall Slalom',
    difficulty: 'medium',
    start: { x: 1360, y: 150 },
    finish: { x: 720, y: 1325 },
    features: [
      solid('icefall-slalom-drop', [{ x: 1285, y: 260 }, { x: 1120, y: 385 }, { x: 965, y: 500 }]),
      solid('icefall-slalom-block-1', [{ x: 825, y: 575 }, { x: 760, y: 735 }, { x: 705, y: 890 }]),
      solid('icefall-slalom-block-2', [{ x: 1025, y: 780 }, { x: 1200, y: 900 }, { x: 1335, y: 1040 }]),
      solid('icefall-slalom-exit', [{ x: 1135, y: 1115 }, { x: 915, y: 1220 }, { x: 685, y: 1300 }]),
      scenery('icefall-slalom-crack-1', [{ x: 460, y: 450 }, { x: 590, y: 390 }, { x: 725, y: 445 }]),
      scenery('icefall-slalom-crack-2', [{ x: 1380, y: 675 }, { x: 1530, y: 620 }, { x: 1660, y: 675 }]),
    ],
  }),
  levelTemplate({
    id: 'halfpipe-run',
    name: 'Halfpipe Run',
    difficulty: 'hard',
    start: { x: 985, y: 135 },
    finish: { x: 1080, y: 1340 },
    features: [
      solid('halfpipe-run-left-wall', [{ x: 650, y: 260 }, { x: 700, y: 520 }, { x: 760, y: 780 }, { x: 860, y: 1035 }]),
      solid('halfpipe-run-right-wall', [{ x: 1260, y: 280 }, { x: 1215, y: 550 }, { x: 1165, y: 820 }, { x: 1085, y: 1090 }]),
      solid('halfpipe-run-bottom', [{ x: 865, y: 1145 }, { x: 1035, y: 1240 }, { x: 1215, y: 1305 }]),
      solid('halfpipe-run-lip', [{ x: 930, y: 635 }, { x: 1020, y: 705 }, { x: 1110, y: 785 }]),
      scenery('halfpipe-run-shade-left', [{ x: 435, y: 690 }, { x: 560, y: 650 }, { x: 685, y: 690 }]),
      scenery('halfpipe-run-shade-right', [{ x: 1310, y: 930 }, { x: 1460, y: 875 }, { x: 1600, y: 930 }]),
    ],
  }),
  levelTemplate({
    id: 'avalanche-basin',
    name: 'Avalanche Basin',
    difficulty: 'hard',
    start: { x: 620, y: 145 },
    finish: { x: 1510, y: 1340 },
    features: [
      solid('avalanche-basin-entry', [{ x: 540, y: 250 }, { x: 780, y: 345 }, { x: 1010, y: 455 }]),
      solid('avalanche-basin-debris-1', [{ x: 1015, y: 570 }, { x: 875, y: 690 }, { x: 735, y: 815 }]),
      solid('avalanche-basin-debris-2', [{ x: 885, y: 880 }, { x: 1115, y: 995 }, { x: 1360, y: 1115 }]),
      solid('avalanche-basin-runout', [{ x: 1340, y: 1205 }, { x: 1515, y: 1285 }, { x: 1690, y: 1325 }]),
      scenery('avalanche-basin-slab-1', [{ x: 270, y: 565 }, { x: 430, y: 515 }, { x: 610, y: 560 }]),
      scenery('avalanche-basin-slab-2', [{ x: 1245, y: 370 }, { x: 1430, y: 305 }, { x: 1615, y: 370 }]),
    ],
  }),
  levelTemplate({
    id: 'summit-canyon',
    name: 'Summit Canyon',
    difficulty: 'hard',
    start: { x: 1710, y: 160 },
    finish: { x: 410, y: 1335 },
    features: [
      solid('summit-canyon-upper', [{ x: 1635, y: 260 }, { x: 1405, y: 355 }, { x: 1185, y: 485 }]),
      solid('summit-canyon-choke-left', [{ x: 1045, y: 560 }, { x: 950, y: 725 }, { x: 885, y: 890 }]),
      solid('summit-canyon-choke-right', [{ x: 1265, y: 700 }, { x: 1370, y: 830 }, { x: 1450, y: 980 }]),
      solid('summit-canyon-exit', [{ x: 1030, y: 1045 }, { x: 735, y: 1185 }, { x: 445, y: 1305 }]),
      scenery('summit-canyon-cliff-1', [{ x: 565, y: 445 }, { x: 735, y: 385 }, { x: 920, y: 440 }]),
      scenery('summit-canyon-cliff-2', [{ x: 1515, y: 1110 }, { x: 1680, y: 1055 }, { x: 1810, y: 1105 }]),
    ],
  }),
];

export const PREGENERATED_LEVEL_COUNT = PREGENERATED_LEVELS.length;
