import type { Point } from '../types';
import { LEVEL_BOUNDS } from './constants';

export interface StaticObstacle {
  id: string;
  type: 'mountain-peak' | 'rock-formation' | 'tree' | 'structure';
  position: Point;
  bounds: { width: number; height: number };
}

export interface WindZone {
  id: string;
  position: Point;
  bounds: { width: number; height: number };
  direction: 'left' | 'right';
  strength: number;
  windSpeed: number;
  shape: 'vertical-column' | 'horizontal-band';
}

export interface Level {
  id: string;
  start: Point;
  finish: Point;
  staticObstacles: StaticObstacle[];
  windZones: WindZone[];
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function generateStaticObstacles(start: Point, finish: Point, roundNumber: number): StaticObstacle[] {
  const obstacleCount = Math.max(0, roundNumber - 1);
  if (obstacleCount === 0) return [];
  
  const obstacles: StaticObstacle[] = [];
  const obstacleTypes: StaticObstacle['type'][] = ['mountain-peak', 'rock-formation', 'tree', 'structure'];
  const EXCLUSION_RADIUS = 250;
  const MIN_OBSTACLE_DISTANCE = 280;
  const RENDERED_SIZE = 200;
  
  for (let i = 0; i < obstacleCount; i++) {
    let attempts = 0;
    let placed = false;
    
    while (!placed && attempts < 50) {
      attempts++;
      
      const minX = Math.min(start.x, finish.x) + EXCLUSION_RADIUS;
      const maxX = Math.max(start.x, finish.x) - EXCLUSION_RADIUS;
      const minY = start.y + EXCLUSION_RADIUS;
      const maxY = finish.y - EXCLUSION_RADIUS;
      
      if (maxX <= minX || maxY <= minY) break;
      
      const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
      const position: Point = {
        x: randomBetween(minX, maxX),
        y: randomBetween(minY, maxY),
      };
      
      const obstacleCenter: Point = {
        x: position.x + RENDERED_SIZE / 2,
        y: position.y + RENDERED_SIZE / 2,
      };
      
      if (getDistance(obstacleCenter, start) < EXCLUSION_RADIUS || 
          getDistance(obstacleCenter, finish) < EXCLUSION_RADIUS) {
        continue;
      }
      
      let tooClose = false;
      for (const existing of obstacles) {
        const existingCenter: Point = {
          x: existing.position.x + RENDERED_SIZE / 2,
          y: existing.position.y + RENDERED_SIZE / 2,
        };
        if (getDistance(existingCenter, obstacleCenter) < MIN_OBSTACLE_DISTANCE) {
          tooClose = true;
          break;
        }
      }
      
      if (tooClose) continue;
      
      obstacles.push({
        id: crypto.randomUUID(),
        type,
        position,
        bounds: { width: RENDERED_SIZE, height: RENDERED_SIZE },
      });
      
      placed = true;
    }
  }
  
  return obstacles;
}

function zonesOverlap(zone1: WindZone, zone2: WindZone): boolean {
  const z1Right = zone1.position.x + zone1.bounds.width;
  const z1Bottom = zone1.position.y + zone1.bounds.height;
  const z2Right = zone2.position.x + zone2.bounds.width;
  const z2Bottom = zone2.position.y + zone2.bounds.height;
  
  return zone1.position.x < z2Right &&
         z1Right > zone2.position.x &&
         zone1.position.y < z2Bottom &&
         z1Bottom > zone2.position.y;
}

function generateWindZones(start: Point, finish: Point): WindZone[] {
  const zones: WindZone[] = [];
  const zoneCount = 1 + Math.floor(Math.random() * 2);
  const levelHeight = finish.y - start.y;
  const { maxWidth } = LEVEL_BOUNDS;
  
  for (let i = 0; i < zoneCount; i++) {
    const useVertical = Math.random() > 0.5;
    
    if (useVertical) {
      const width = randomBetween(400, 800);
      const minX = Math.min(start.x, finish.x) + 50;
      const maxX = Math.max(start.x, finish.x) - 50;
      
      if (maxX <= minX + width) continue;
      
      const direction = Math.random() > 0.5 ? 'left' : 'right';
      const strength = randomBetween(0.25, 0.8);
      const windSpeed = direction === 'right' ? randomBetween(0.3, 1.0) : randomBetween(-1.0, -0.3);
      
      zones.push({
        id: crypto.randomUUID(),
        position: {
          x: randomBetween(minX, maxX - width),
          y: start.y,
        },
        bounds: {
          width,
          height: levelHeight,
        },
        direction,
        strength,
        windSpeed,
        shape: 'vertical-column',
      });
    } else {
      const height = randomBetween(150, 300);
      const minY = start.y + 50;
      const maxY = finish.y - 50;
      
      if (maxY <= minY + height) continue;
      
      const direction = Math.random() > 0.5 ? 'left' : 'right';
      const strength = randomBetween(0.25, 0.8);
      const windSpeed = direction === 'right' ? randomBetween(0.3, 1.0) : randomBetween(-1.0, -0.3);
      
      zones.push({
        id: crypto.randomUUID(),
        position: {
          x: 0,
          y: randomBetween(minY, maxY - height),
        },
        bounds: { width: maxWidth, height },
        direction,
        strength,
        windSpeed,
        shape: 'horizontal-band',
      });
    }
  }
  
  const filteredZones: WindZone[] = [];
  for (const zone of zones) {
    if (!filteredZones.some(existing => zonesOverlap(zone, existing))) {
      filteredZones.push(zone);
    }
  }
  
  return filteredZones;
}

export function generateLevel(roundNumber: number = 1): Level {
  const { maxWidth, maxHeight, minSeparation } = LEVEL_BOUNDS;
  
  const startX = randomBetween(maxWidth * 0.2, maxWidth * 0.8);
  const startY = randomBetween(50, maxHeight * 0.3);
  
  const minFinishY = startY + maxHeight * minSeparation;
  const finishY = randomBetween(minFinishY, maxHeight * 0.9);
  
  const horizontalDirection = Math.random() > 0.5 ? 1 : -1;
  const horizontalOffset = randomBetween(maxWidth * 0.1, maxWidth * 0.4);
  const finishX = clamp(startX + horizontalDirection * horizontalOffset, 100, maxWidth - 100);

  const start: Point = { x: startX, y: startY };
  const finish: Point = { x: finishX, y: finishY };
  
  return {
    id: crypto.randomUUID(),
    start,
    finish,
    staticObstacles: generateStaticObstacles(start, finish, roundNumber),
    windZones: generateWindZones(start, finish),
  };
}
