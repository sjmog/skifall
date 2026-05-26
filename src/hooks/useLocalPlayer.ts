import { useCallback, useEffect, useRef, useState } from 'react';
import { usePhysics } from './usePhysics';
import { useDrawing } from './useDrawing';
import type { Point, Line, SkierState } from '../types';
import { calculateInitialPositions, type SkierRenderState } from '../lib/skier';
import type { SkierPhysicsState } from '../lib/physics';

export interface LocalPlayer {
  id: string;
  lines: Line[];
  currentStroke: Point[];
  isDrawing: boolean;
  skierRenderState: SkierRenderState;
  runState: SkierState;
}

interface UseLocalPlayerActions {
  initAtSpawn: (spawnX: number, spawnY: number) => void;
  startDrawing: (point: Point) => void;
  continueDrawing: (point: Point) => void;
  endDrawing: () => Line | null;
  eraseLine: (point: Point) => string | null;
  getLineAtPoint: (point: Point) => string | null;
  clearLines: () => void;
  setTerrainLines: (lines: Line[]) => void;
  play: () => void;
  reset: (spawnX: number, spawnY: number) => void;
  update: (delta: number) => SkierRenderState;
  setRunState: (state: SkierState) => void;
  getPhysicsState: () => SkierPhysicsState | null;
}

export interface UseLocalPlayerReturn {
  player: LocalPlayer;
  actions: UseLocalPlayerActions;
}

let playerIdCounter = 0;

export function useLocalPlayer(): UseLocalPlayerReturn {
  const playerId = useRef(`local-${++playerIdCounter}`);
  const physics = usePhysics();
  const drawing = useDrawing();
  
  const [runState, setRunState] = useState<SkierState>('idle');
  const [skierRenderState, setSkierRenderState] = useState<SkierRenderState>(() =>
    calculateInitialPositions(0, 0)
  );

  // Bidirectional sync: keep physics lines in sync with drawing lines
  useEffect(() => {
    const physicsLineIds = new Set(physics.getLineIds());
    const drawingLineIds = new Set(drawing.lines.map((l) => l.id));
    
    for (const id of physicsLineIds) {
      if (!drawingLineIds.has(id)) {
        physics.removeLine(id);
      }
    }
    
    for (const line of drawing.lines) {
      if (!physicsLineIds.has(line.id)) {
        physics.addLine(line);
      }
    }
  }, [drawing.lines, physics]);

  const initAtSpawn = useCallback((spawnX: number, spawnY: number) => {
    physics.initPhysics(spawnX, spawnY);
    setSkierRenderState(calculateInitialPositions(spawnX, spawnY));
    setRunState('idle');
  }, [physics]);

  const endDrawing = useCallback((): Line | null => {
    const newLine = drawing.endDrawing();
    if (newLine) {
      physics.addLine(newLine);
    }
    return newLine;
  }, [drawing, physics]);

  const eraseLine = useCallback((point: Point): string | null => {
    const erasedId = drawing.eraseLine(point);
    if (erasedId) {
      physics.removeLine(erasedId);
    }
    return erasedId;
  }, [drawing, physics]);

  const play = useCallback(() => {
    if (runState === 'idle') {
      setRunState('moving');
      physics.play();
    }
  }, [runState, physics]);

  const reset = useCallback((spawnX: number, spawnY: number) => {
    physics.reset();
    setSkierRenderState(calculateInitialPositions(spawnX, spawnY));
    setRunState('idle');
  }, [physics]);

  const update = useCallback((delta: number): SkierRenderState => {
    if (runState === 'moving' || runState === 'fallen' || runState === 'finished') {
      const result = physics.update(delta);
      setSkierRenderState(result);
      
      if (result.crashed && runState === 'moving') {
        setRunState('fallen');
      }
      
      return result;
    }
    return skierRenderState;
  }, [runState, physics, skierRenderState]);

  const player: LocalPlayer = {
    id: playerId.current,
    lines: drawing.lines,
    currentStroke: drawing.currentStroke,
    isDrawing: drawing.isDrawing,
    skierRenderState,
    runState,
  };

  const actions: UseLocalPlayerActions = {
    initAtSpawn,
    startDrawing: drawing.startDrawing,
    continueDrawing: drawing.continueDrawing,
    endDrawing,
    eraseLine,
    getLineAtPoint: drawing.getLineAtPoint,
    clearLines: drawing.clearLines,
    setTerrainLines: physics.setTerrainLines,
    play,
    reset,
    update,
    setRunState,
    getPhysicsState: physics.getPhysicsState,
  };

  return { player, actions };
}
