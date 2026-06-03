export interface Point {
  x: number;
  y: number;
}

export interface Line {
  id: string;
  points: Point[];
}

export type Tool = 'hand' | 'pencil' | 'eraser';

export type SkierState = 'idle' | 'moving' | 'fallen' | 'finished';

export type GameMode = 'downhill' | 'freestyle';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface SkierPartState {
  x: number;
  y: number;
  angle: number;
}

export interface SkierRenderState {
  head: SkierPartState;
  upper: SkierPartState;
  lower: SkierPartState;
  skis: SkierPartState;
  crashed: boolean;
}
