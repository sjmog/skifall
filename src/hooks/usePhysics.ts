import { useRef, useCallback } from 'react';
import {
  createPhysicsEngine,
  addLineToWorld,
  removeLineFromWorld,
  resetSkier,
  startSkier,
  stepPhysics,
  getSkierState,
  getSkierPhysicsState,
  type PhysicsEngine,
  type SkierPhysicsState,
} from '../lib/physics';
import type { Line } from '../types';
import type { SkierRenderState } from '../lib/skier';

interface UsePhysicsReturn {
  initPhysics: (spawnX: number, spawnY: number) => void;
  addLine: (line: Line) => void;
  removeLine: (lineId: string) => void;
  setTerrainLines: (lines: Line[]) => void;
  getLineIds: () => string[];
  reset: () => void;
  play: () => void;
  update: (delta: number) => SkierRenderState;
  getPhysicsState: () => SkierPhysicsState | null;
}

export function usePhysics(): UsePhysicsReturn {
  const engineRef = useRef<PhysicsEngine | null>(null);
  const terrainLineIdsRef = useRef<Set<string>>(new Set());

  const initPhysics = useCallback((spawnX: number, spawnY: number) => {
    engineRef.current = createPhysicsEngine(spawnX, spawnY);
  }, []);

  const addLine = useCallback((line: Line) => {
    if (engineRef.current) {
      addLineToWorld(engineRef.current, line);
    }
  }, []);

  const removeLine = useCallback((lineId: string) => {
    if (engineRef.current) {
      removeLineFromWorld(engineRef.current, lineId);
    }
  }, []);

  const setTerrainLines = useCallback((lines: Line[]) => {
    if (!engineRef.current) return;

    for (const lineId of terrainLineIdsRef.current) {
      removeLineFromWorld(engineRef.current, lineId);
    }

    terrainLineIdsRef.current = new Set(lines.map((line) => line.id));

    for (const line of lines) {
      addLineToWorld(engineRef.current, line);
    }
  }, []);

  const getLineIds = useCallback((): string[] => {
    if (engineRef.current) {
      return Array.from(engineRef.current.lineFixtures.keys()).filter(
        (id) => !terrainLineIdsRef.current.has(id)
      );
    }
    return [];
  }, []);

  const reset = useCallback(() => {
    if (engineRef.current) {
      resetSkier(engineRef.current);
    }
  }, []);

  const play = useCallback(() => {
    if (engineRef.current) {
      startSkier(engineRef.current);
    }
  }, []);

  const update = useCallback((delta: number): SkierRenderState => {
    if (engineRef.current) {
      stepPhysics(engineRef.current, delta);
      return getSkierState(engineRef.current);
    }
    return {
      head: { x: 0, y: 0, angle: 0 },
      upper: { x: 0, y: 0, angle: 0 },
      lower: { x: 0, y: 0, angle: 0 },
      skis: { x: 0, y: 0, angle: 0 },
      crashed: false,
    };
  }, []);

  const getPhysicsState = useCallback((): SkierPhysicsState | null => {
    if (engineRef.current) {
      return getSkierPhysicsState(engineRef.current);
    }
    return null;
  }, []);

  // Note: We intentionally don't clean up engineRef on unmount because
  // React StrictMode double-mounts components, which would destroy the engine
  // between the init effect and when play is called. The physics engine is
  // lightweight and will be garbage collected when the component truly unmounts.

  return {
    initPhysics,
    addLine,
    removeLine,
    setTerrainLines,
    getLineIds,
    reset,
    play,
    update,
    getPhysicsState,
  };
}
