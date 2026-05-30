import { SKIER_WIDTH, SKIER_HEIGHT, COLORS } from './constants';
import { getSkierSprites, type SkierCharacter } from './sprites';
import type { SkierRenderState } from '../types';

export type { SkierRenderState } from '../types';

export const HEAD_RADIUS = 7;
export const UPPER_BODY_WIDTH = SKIER_WIDTH;
export const UPPER_BODY_HEIGHT = SKIER_HEIGHT * 0.45;
export const LOWER_BODY_WIDTH = SKIER_WIDTH * 0.8;
export const LOWER_BODY_HEIGHT = SKIER_HEIGHT * 0.35;
export const SKI_WIDTH = SKIER_WIDTH * 1.5;
export const SKI_HEIGHT = 4;

// Sprite rendering scale (pixels in sprite -> world units)
export const SKIER_SPRITE_SCALE = 0.1;

// Offsets to align sprite visual centers with physics body centers
// The sprites are designed as stacking parts, but physics bodies have different centers
// Negative Y moves sprite up, positive Y moves sprite down
export const SKIER_SPRITE_OFFSETS = {
  head: { x: 0, y: 0 },   // Head sprite - position above physics center (hat is tall)
  torso: { x: -5, y: 5 },  // Torso - shift up (sprite includes shoulders above center)
  legs: { x: 0, y: 0 },    // Legs - shift up (sprite has waistband above center)
  skis: { x: 0, y: 0 },     // Skis - keep centered
};

export function calculateInitialPositions(spawnX: number, spawnY: number): SkierRenderState {
  const skiCenterY = spawnY;
  const ankleY = skiCenterY - SKI_HEIGHT / 2;
  const lowerCenterY = ankleY - LOWER_BODY_HEIGHT / 2;
  const hipY = lowerCenterY - LOWER_BODY_HEIGHT / 2;
  const upperCenterY = hipY - UPPER_BODY_HEIGHT / 2;
  const neckY = upperCenterY - UPPER_BODY_HEIGHT / 2;
  const headCenterY = neckY - HEAD_RADIUS;

  return {
    head: { x: spawnX, y: headCenterY, angle: 0 },
    upper: { x: spawnX, y: upperCenterY, angle: 0 },
    lower: { x: spawnX, y: lowerCenterY, angle: 0 },
    skis: { x: spawnX, y: skiCenterY, angle: 0 },
    crashed: false,
  };
}

function drawPart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  draw: () => void
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  draw();
  ctx.restore();
}

function drawSpritePart(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  angle: number,
  scale: number,
  offsetX = 0,
  offsetY = 0
) {
  const w = img.width * SKIER_SPRITE_SCALE * scale;
  const h = img.height * SKIER_SPRITE_SCALE * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, -w / 2 + offsetX, -h / 2 + offsetY, w, h);
  ctx.restore();
}

function drawFallbackPart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  width: number,
  height: number,
  color: string,
  isCircle = false
) {
  drawPart(ctx, x, y, angle, () => {
    ctx.fillStyle = color;
    if (isCircle) {
      ctx.beginPath();
      ctx.arc(0, 0, width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-width / 2, -height / 2, width, height);
    }
  });
}

// Current character for local player (can be changed)
let currentCharacter: SkierCharacter = 1;

export function setSkierCharacter(character: SkierCharacter) {
  currentCharacter = character;
}

export function getSkierCharacter(): SkierCharacter {
  return currentCharacter;
}

export function drawSkier(ctx: CanvasRenderingContext2D, state: SkierRenderState, scale = 1, character?: SkierCharacter) {
  const { head, upper, lower, skis } = state;
  const sprites = getSkierSprites(character ?? currentCharacter);

  if (scale !== 1) {
    ctx.save();
    ctx.translate(upper.x, upper.y);
    ctx.scale(scale, scale);
    ctx.translate(-upper.x, -upper.y);
  }

  if (sprites) {
    // Draw with sprites (back to front: skis, legs, torso, head)
    drawSpritePart(ctx, sprites.skis, skis.x, skis.y, skis.angle, scale, SKIER_SPRITE_OFFSETS.skis.x, SKIER_SPRITE_OFFSETS.skis.y);
    drawSpritePart(ctx, sprites.legs, lower.x, lower.y, lower.angle, scale, SKIER_SPRITE_OFFSETS.legs.x, SKIER_SPRITE_OFFSETS.legs.y);
    drawSpritePart(ctx, sprites.torso, upper.x, upper.y, upper.angle, scale, SKIER_SPRITE_OFFSETS.torso.x, SKIER_SPRITE_OFFSETS.torso.y);
    drawSpritePart(ctx, sprites.head, head.x, head.y, head.angle, scale, SKIER_SPRITE_OFFSETS.head.x, SKIER_SPRITE_OFFSETS.head.y);
  } else {
    // Fallback to shapes if sprites not loaded
    drawFallbackPart(ctx, skis.x, skis.y, skis.angle, SKI_WIDTH, SKI_HEIGHT, COLORS.skis);
    drawFallbackPart(ctx, lower.x, lower.y, lower.angle, LOWER_BODY_WIDTH, LOWER_BODY_HEIGHT, COLORS.legs);
    drawFallbackPart(ctx, upper.x, upper.y, upper.angle, UPPER_BODY_WIDTH, UPPER_BODY_HEIGHT, COLORS.skier);
    drawFallbackPart(ctx, head.x, head.y, head.angle, HEAD_RADIUS * 2, HEAD_RADIUS * 2, COLORS.head, true);
  }

  if (scale !== 1) {
    ctx.restore();
  }
}

export function drawGhostSkier(
  ctx: CanvasRenderingContext2D, 
  state: SkierRenderState, 
  color: string,
  opacity = 0.3,
  character?: SkierCharacter
) {
  const { head, upper, lower, skis } = state;
  const sprites = getSkierSprites(character ?? currentCharacter);

  ctx.save();
  ctx.globalAlpha = opacity;

  if (sprites) {
    // Draw sprites for ghost (with reduced opacity)
    drawSpritePart(ctx, sprites.skis, skis.x, skis.y, skis.angle, 1, SKIER_SPRITE_OFFSETS.skis.x, SKIER_SPRITE_OFFSETS.skis.y);
    drawSpritePart(ctx, sprites.legs, lower.x, lower.y, lower.angle, 1, SKIER_SPRITE_OFFSETS.legs.x, SKIER_SPRITE_OFFSETS.legs.y);
    drawSpritePart(ctx, sprites.torso, upper.x, upper.y, upper.angle, 1, SKIER_SPRITE_OFFSETS.torso.x, SKIER_SPRITE_OFFSETS.torso.y);
    drawSpritePart(ctx, sprites.head, head.x, head.y, head.angle, 1, SKIER_SPRITE_OFFSETS.head.x, SKIER_SPRITE_OFFSETS.head.y);
  } else {
    // Fallback to colored shapes
    drawFallbackPart(ctx, skis.x, skis.y, skis.angle, SKI_WIDTH, SKI_HEIGHT, color);
    drawFallbackPart(ctx, lower.x, lower.y, lower.angle, LOWER_BODY_WIDTH, LOWER_BODY_HEIGHT, color);
    drawFallbackPart(ctx, upper.x, upper.y, upper.angle, UPPER_BODY_WIDTH, UPPER_BODY_HEIGHT, color);
    drawFallbackPart(ctx, head.x, head.y, head.angle, HEAD_RADIUS * 2, HEAD_RADIUS * 2, color, true);
  }

  ctx.restore();
}
