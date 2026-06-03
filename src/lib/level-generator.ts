import type { Point } from '../types';
import { LEVEL_BOUNDS } from './constants';
import {
  PREGENERATED_LEVELS,
  getLevelData,
  getLevelMetadata,
  getLevelsByDifficulty,
  type LevelData,
  type LevelDifficulty,
  type LevelFeature,
  type LevelMetadata,
} from './pregenerated-levels';

export interface Level {
  id: string;
  templateId?: string;
  name?: string;
  owners?: string[];
  difficulty?: LevelDifficulty;
  metadata?: LevelMetadata;
  data?: LevelData;
  start: Point;
  finish: Point;
  features: LevelFeature[];
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cloneFeatures(features: LevelFeature[]): LevelFeature[] {
  return features.map((feature) => ({
    ...feature,
    points: feature.points.map((point) => ({ ...point })),
  }));
}

function normalizeIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

export function generatePregeneratedLevel(
  index?: number,
  difficulty?: LevelDifficulty
): Level {
  const availableLevels = difficulty
    ? getLevelsByDifficulty(difficulty)
    : PREGENERATED_LEVELS;
  const levelBank = availableLevels.length > 0 ? availableLevels : PREGENERATED_LEVELS;
  const levelIndex = index ?? Math.floor(Math.random() * levelBank.length);
  const template = levelBank[normalizeIndex(levelIndex, levelBank.length)];
  const levelData = getLevelData(template);
  const metadata = getLevelMetadata(template);
  const blackLines = cloneFeatures(levelData.blackLines);
  const greyLines = cloneFeatures(levelData.greyLines);

  return {
    id: `${template.id}-${crypto.randomUUID()}`,
    templateId: metadata.levelId,
    name: metadata.name,
    owners: metadata.owners,
    difficulty: metadata.difficulty,
    metadata,
    data: {
      start: { ...levelData.start },
      finish: { ...levelData.finish },
      blackLines,
      greyLines,
    },
    start: { ...levelData.start },
    finish: { ...levelData.finish },
    features: [...blackLines, ...greyLines],
  };
}

export function generateLevel(
  usePregeneratedLevel = false,
  pregeneratedIndex?: number,
  difficulty?: LevelDifficulty
): Level {
  if (usePregeneratedLevel) {
    return generatePregeneratedLevel(pregeneratedIndex, difficulty);
  }

  const { maxWidth, maxHeight, minSeparation } = LEVEL_BOUNDS;
  
  const startX = randomBetween(maxWidth * 0.2, maxWidth * 0.8);
  const startY = randomBetween(50, maxHeight * 0.3);
  
  const minFinishY = startY + maxHeight * minSeparation;
  const finishY = randomBetween(minFinishY, maxHeight * 0.9);
  
  const horizontalDirection = Math.random() > 0.5 ? 1 : -1;
  const horizontalOffset = randomBetween(maxWidth * 0.1, maxWidth * 0.4);
  const finishX = clamp(startX + horizontalDirection * horizontalOffset, 100, maxWidth - 100);
  
  return {
    id: crypto.randomUUID(),
    start: { x: startX, y: startY },
    finish: { x: finishX, y: finishY },
    data: {
      start: { x: startX, y: startY },
      finish: { x: finishX, y: finishY },
      blackLines: [],
      greyLines: [],
    },
    features: [],
  };
}
