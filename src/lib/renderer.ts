import type { Point, Line, Camera } from '../types';
import { COLORS, LINE_WIDTH } from './constants';
import type { LevelFeature } from './pregenerated-levels';

const GRID_SIZE = 50;

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number
) {
  const viewWidth = canvasWidth / camera.zoom;
  const viewHeight = canvasHeight / camera.zoom;
  const padding = GRID_SIZE * 2;

  const left = camera.x - viewWidth / 2 - padding;
  const right = camera.x + viewWidth / 2 + padding;
  const top = camera.y - viewHeight / 2 - padding;
  const bottom = camera.y + viewHeight / 2 + padding;

  const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
  const endX = Math.ceil(right / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE;
  const endY = Math.ceil(bottom / GRID_SIZE) * GRID_SIZE;

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;

  for (let x = startX; x <= endX; x += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
    ctx.stroke();
  }

  for (let y = startY; y <= endY; y += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }
}

export function drawMarker(
  ctx: CanvasRenderingContext2D,
  position: Point,
  label: string,
  color: string,
  scale = 1
) {
  if (scale <= 0) return;

  ctx.save();
  ctx.translate(position.x, position.y - 20);
  ctx.scale(scale, scale);

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.3 * scale;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = scale;

  ctx.fillStyle = color;
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(label, 0, -40);

  ctx.restore();
}

export function drawLine(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  highlight = false,
  opacity = 1,
  color?: string
) {
  if (points.length < 2 || opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color ?? (highlight ? COLORS.lineHighlight : COLORS.line);
  ctx.lineWidth = highlight ? LINE_WIDTH + 2 : LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: Line[],
  hoveredLineId: string | null,
  opacity = 1
) {
  for (const line of lines) {
    drawLine(ctx, line.points, line.id === hoveredLineId, opacity);
  }
}

export function drawLevelFeatures(
  ctx: CanvasRenderingContext2D,
  features: LevelFeature[],
  opacity = 1
) {
  for (const feature of features) {
    drawLine(
      ctx,
      feature.points,
      false,
      feature.kind === 'solid' ? opacity : opacity * 0.55,
      feature.kind === 'solid' ? COLORS.line : '#9CA3AF'
    );
  }
}

export function applyCameraTransform(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number
) {
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
}

export function calculateFitBounds(
  start: Point,
  finish: Point,
  viewportWidth: number,
  viewportHeight: number,
  padding = 150,
  extraPoints: Point[] = []
): { centerX: number; centerY: number; zoom: number } {
  const points = [start, finish, ...extraPoints];
  const minX = Math.min(...points.map((point) => point.x)) - padding;
  const maxX = Math.max(...points.map((point) => point.x)) + padding;
  const minY = Math.min(...points.map((point) => point.y)) - padding;
  const maxY = Math.max(...points.map((point) => point.y)) + padding;

  const width = maxX - minX;
  const height = maxY - minY;

  const zoomX = viewportWidth / width;
  const zoomY = viewportHeight / height;
  const zoom = Math.min(zoomX, zoomY, 1); // Cap at 1x

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    zoom,
  };
}
