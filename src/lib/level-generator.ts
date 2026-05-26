import type { Point } from '../types';
import { LEVEL_BOUNDS } from './constants';
import {
  PREGENERATED_LEVELS,
  type LevelFeature,
} from './pregenerated-levels';

export interface Level {
  id: string;
  name?: string;
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

export function generatePregeneratedLevel(index = Math.floor(Math.random() * PREGENERATED_LEVELS.length)): Level {
  const template = PREGENERATED_LEVELS[index % PREGENERATED_LEVELS.length];

  return {
    id: `${template.id}-${crypto.randomUUID()}`,
    name: template.name,
    start: { ...template.start },
    finish: { ...template.finish },
    features: cloneFeatures(template.features),
  };
}

export function generateLevel(usePregeneratedLevel = false, pregeneratedIndex?: number): Level {
  if (usePregeneratedLevel) {
    return generatePregeneratedLevel(pregeneratedIndex);
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
    features: [],
  };
}
