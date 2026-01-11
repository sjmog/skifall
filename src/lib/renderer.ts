import type { Point, Line, Camera } from '../types';
import { COLORS, LINE_WIDTH } from './constants';
import type { StaticObstacle, WindZone } from './level-generator';

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
  padding = 150
): { centerX: number; centerY: number; zoom: number } {
  const minX = Math.min(start.x, finish.x) - padding;
  const maxX = Math.max(start.x, finish.x) + padding;
  const minY = Math.min(start.y, finish.y) - padding;
  const maxY = Math.max(start.y, finish.y) + padding;

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

export function drawObstacle(
  ctx: CanvasRenderingContext2D,
  obstacle: StaticObstacle,
  obstacleImage: HTMLImageElement | null,
  scale = 1
): void {
  if (scale <= 0) return;
  
  ctx.save();
  ctx.globalAlpha = scale;
  
  if (obstacleImage) {
    const scaledWidth = obstacleImage.width * 0.4;
    const scaledHeight = obstacleImage.height * 0.4;
    ctx.drawImage(obstacleImage, obstacle.position.x, obstacle.position.y, scaledWidth, scaledHeight);
  } else {
    ctx.fillStyle = '#6B7280';
    ctx.globalAlpha = 0.7 * scale;
    ctx.fillRect(obstacle.position.x, obstacle.position.y, obstacle.bounds.width, obstacle.bounds.height);
  }
  ctx.restore();
}

export function drawObstacles(
  ctx: CanvasRenderingContext2D,
  obstacles: StaticObstacle[],
  getObstacleImage: (type: StaticObstacle['type']) => HTMLImageElement | null,
  scale = 1
): void {
  for (const obstacle of obstacles) {
    let obstacleImage: HTMLImageElement | null = null;
    switch (obstacle.type) {
      case 'mountain-peak':
        obstacleImage = getObstacleImage('mountain-peak');
        break;
      case 'rock-formation':
        obstacleImage = getObstacleImage('rock-formation');
        break;
      case 'tree':
        obstacleImage = getObstacleImage('tree');
        break;
      case 'structure':
        obstacleImage = getObstacleImage('structure');
        break;
    }
    drawObstacle(ctx, obstacle, obstacleImage, scale);
  }
}

export function drawWindZone(
  ctx: CanvasRenderingContext2D,
  zone: WindZone,
  animationTime: number,
  extendedWidth: number
): void {
  const { position, bounds, shape, windSpeed, direction } = zone;
  const baseOpacity = 0.25;
  const lineSpacing = 60;
  const waveAmplitude = 12;
  const waveFrequency = 0.025;
  const movementSpeed = 0.01;
  const moveRight = direction === 'right';
  
  ctx.save();
  ctx.globalAlpha = baseOpacity;
  ctx.strokeStyle = '#6B7280';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  
  if (shape === 'vertical-column') {
    const numLines = Math.ceil(bounds.width / lineSpacing) + 3;
    const cycleLength = lineSpacing * 2;
    const rawOffset = animationTime * movementSpeed * windSpeed * 20;
    let offsetX = rawOffset % cycleLength;
    if (offsetX < 0) offsetX += cycleLength;
    const directionOffset = moveRight ? -offsetX : offsetX;
    
    for (let i = -2; i <= numLines; i++) {
      let baseX = position.x + (i * lineSpacing) + directionOffset;
      
      while (baseX < position.x - cycleLength) {
        baseX += cycleLength;
      }
      while (baseX > position.x + bounds.width + cycleLength) {
        baseX -= cycleLength;
      }
      
      if (baseX < position.x - cycleLength || baseX > position.x + bounds.width + cycleLength) continue;
      
      ctx.beginPath();
      let firstPoint = true;
      
      for (let y = position.y; y <= position.y + bounds.height; y += 3) {
        const wave = Math.sin((y * waveFrequency) + (animationTime * movementSpeed * 0.5)) * waveAmplitude;
        const x = baseX + wave;
        
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
    }
  } else {
    const numLines = Math.ceil(bounds.height / lineSpacing) + 1;
    const cycleLength = lineSpacing * 2;
    const rawOffset = animationTime * movementSpeed * windSpeed * 20;
    let offsetX = rawOffset % cycleLength;
    if (offsetX < 0) offsetX += cycleLength;
    const directionOffset = moveRight ? -offsetX : offsetX;
    const renderWidth = extendedWidth;
    const centerX = position.x + bounds.width / 2;
    const startX = centerX - renderWidth / 2;
    const endX = centerX + renderWidth / 2;
    
    for (let i = 0; i <= numLines; i++) {
      const baseY = position.y + (i * lineSpacing);
      
      ctx.beginPath();
      let firstPoint = true;
      
      for (let x = startX; x <= endX; x += 3) {
        let animatedX = x + directionOffset;
        
        while (animatedX > endX) {
          animatedX -= cycleLength;
        }
        while (animatedX < startX) {
          animatedX += cycleLength;
        }
        
        if (animatedX < startX || animatedX > endX) continue;
        
        const wave = Math.sin((animatedX * waveFrequency) + (animationTime * movementSpeed * 0.5)) * waveAmplitude;
        const y = baseY + wave;
        
        if (firstPoint) {
          ctx.moveTo(animatedX, y);
          firstPoint = false;
        } else {
          ctx.lineTo(animatedX, y);
        }
      }
      
      ctx.stroke();
    }
  }
  
  ctx.restore();
}

export function drawWindZones(
  ctx: CanvasRenderingContext2D,
  zones: WindZone[],
  animationTime: number,
  camera: { x: number; y: number; zoom: number },
  canvasWidth: number
): void {
  const viewWidth = canvasWidth / camera.zoom;
  const extendedWidth = Math.max(10000, viewWidth * 10);
  
  for (const zone of zones) {
    drawWindZone(ctx, zone, animationTime, extendedWidth);
  }
}
