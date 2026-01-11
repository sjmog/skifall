import { useState, useCallback, useRef } from 'react';
import { generateLevel, type Level } from '../lib/level-generator';
import { calculateScore } from '../lib/scoring';

export type RoundPhase = 'ready' | 'playing' | 'finished';

export interface RoundResult {
  finishTime: number | null;
  score: number;
  skillScore: number;
}

interface UseGameStateReturn {
  level: Level;
  pendingLevel: Level | null;
  roundResult: RoundResult | null;
  generateNextLevel: () => void;
  applyPendingLevel: () => void;
  setLevel: (level: Level) => void;
  finishRound: (finishTime: number | null, skillScore?: number) => void;
  resetRound: () => void;
}

export function useGameState(initialLevel?: Level | null, currentRound: number = 1): UseGameStateReturn {
  const [level, setLevelState] = useState<Level>(() => initialLevel ?? generateLevel(currentRound));
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const pendingLevelRef = useRef<Level | null>(null);
  const [pendingLevel, setPendingLevel] = useState<Level | null>(null);

  const generateNextLevel = useCallback(() => {
    const next = generateLevel(currentRound);
    pendingLevelRef.current = next;
    setPendingLevel(next);
  }, [currentRound]);

  const applyPendingLevel = useCallback(() => {
    if (pendingLevelRef.current) {
      setLevelState(pendingLevelRef.current);
      pendingLevelRef.current = null;
      setPendingLevel(null);
    setRoundResult(null);
    }
  }, []);

  const setLevel = useCallback((newLevel: Level) => {
    setLevelState(newLevel);
    setRoundResult(null);
  }, []);

  const finishRound = useCallback((finishTime: number | null, skillScore: number = 0) => {
    setRoundResult({
      finishTime,
      score: calculateScore(finishTime, skillScore),
      skillScore,
    });
  }, []);

  const resetRound = useCallback(() => {
    setRoundResult(null);
  }, []);

  return {
    level,
    pendingLevel,
    roundResult,
    generateNextLevel,
    applyPendingLevel,
    setLevel,
    finishRound,
    resetRound,
  };
}
