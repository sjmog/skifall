import { useEffect, useState, useCallback, useRef } from 'react';
import PartySocket from 'partysocket';
import type { Level } from '../lib/level-generator';
import type { GameMode, Line, SkierRenderState, SkierState } from '../types';

export type GamePhase = 'lobby' | 'playing' | 'round-complete' | 'game-over';

export interface RoundResult {
  finishTime: number | null;
  score: number;
  skillScore: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  avatar: string;
  character: number;
  isReady: boolean;
  isSpectating: boolean;
  roundResult: RoundResult | null;
  totalScore: number;
}

export interface RemoteLine extends Line {
  playerId: string;
}

export interface RemoteSkier {
  playerId: string;
  state: SkierRenderState;
  runState: SkierState;
  timestamp: number;
}

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || 'localhost:1999';

export function usePartySocket(roomId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gamePhase, setGamePhase] = useState<GamePhase>('lobby');
  const [level, setLevel] = useState<Level | null>(null);
  const [roundStartTime, setRoundStartTime] = useState<number | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(5);
  const [gameMode, setGameModeState] = useState<GameMode>('downhill');
  const [roundOptions, setRoundOptions] = useState<number[]>([3, 5, 7, 10]);
  const [remoteLines, setRemoteLines] = useState<RemoteLine[]>([]);
  const [remoteSkiers, setRemoteSkiers] = useState<Map<string, RemoteSkier>>(new Map());
  
  const socketRef = useRef<PartySocket | null>(null);
  const messageHandlerRef = useRef<((data: unknown) => void) | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      party: 'main',
      room: roomId,
    });

    socketRef.current = socket;

    socket.addEventListener('open', () => {
      setIsConnected(true);
    });

    socket.addEventListener('close', () => {
      setIsConnected(false);
      setPlayerId(null);
      setPlayers([]);
      setGamePhase('lobby');
      setLevel(null);
      setRoundStartTime(null);
      setCurrentRound(0);
      setRemoteLines([]);
      setRemoteSkiers(new Map());
    });

    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'welcome':
            setPlayerId(data.playerId);
            setPlayers(data.players);
            setGamePhase(data.gamePhase);
            if (data.level) setLevel(data.level);
            if (data.roundStartTime) setRoundStartTime(data.roundStartTime);
            setCurrentRound(data.currentRound ?? 0);
            setTotalRounds(data.totalRounds ?? 5);
            setGameModeState(data.gameMode ?? (data.usePregeneratedLevels === false ? 'freestyle' : 'downhill'));
            if (data.roundOptions) setRoundOptions(data.roundOptions);
            if (data.lines) setRemoteLines(data.lines);
            break;
            
          case 'game-state':
            setGamePhase(data.gamePhase);
            setPlayers(data.players);
            if (data.level) setLevel(data.level);
            if (data.roundStartTime) setRoundStartTime(data.roundStartTime);
            setCurrentRound(data.currentRound ?? 0);
            setTotalRounds(data.totalRounds ?? 5);
            setGameModeState(data.gameMode ?? (data.usePregeneratedLevels === false ? 'freestyle' : 'downhill'));
            if (data.gamePhase === 'playing') {
              setRemoteLines([]);
              setRemoteSkiers(new Map());
            }
            break;
            
          case 'player-joined':
            setPlayers(data.players);
            break;
            
          case 'player-left':
            setPlayers(data.players);
            if (data.removedLineIds) {
              setRemoteLines(prev => prev.filter(l => !data.removedLineIds.includes(l.id)));
            }
            setRemoteSkiers(prev => {
              const next = new Map(prev);
              next.delete(data.playerId);
              return next;
            });
            break;
            
          case 'player-finished':
            setPlayers(prev => prev.map(p => 
              p.id === data.playerId 
                ? { ...p, roundResult: data.roundResult, totalScore: data.totalScore }
                : p
            ));
            break;
            
          case 'level-update':
            if (data.level) setLevel(data.level);
            if (data.roundStartTime) setRoundStartTime(data.roundStartTime);
            setRemoteLines([]);
            setRemoteSkiers(new Map());
            break;
            
          case 'line-add':
            setRemoteLines(prev => [...prev, data.line]);
            break;
            
          case 'line-remove':
            setRemoteLines(prev => prev.filter(l => l.id !== data.lineId));
            break;
            
          case 'lines-clear':
            setRemoteLines(prev => prev.filter(l => l.playerId !== data.playerId));
            break;
            
          case 'skier-position':
            setRemoteSkiers(prev => {
              const next = new Map(prev);
              next.set(data.playerId, {
                playerId: data.playerId,
                state: data.state,
                runState: data.runState,
                timestamp: Date.now(),
              });
              return next;
            });
            break;
            
          default:
            messageHandlerRef.current?.(data);
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [roomId]);

  const send = useCallback((data: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    }
  }, []);

  const setReady = useCallback((isReady: boolean) => {
    send({ type: 'set-ready', isReady });
  }, [send]);

  const setTotalRoundsOption = useCallback((totalRounds: number) => {
    send({ type: 'set-total-rounds', totalRounds });
  }, [send]);

  const setGameMode = useCallback((gameMode: GameMode) => {
    send({ type: 'set-game-mode', gameMode });
  }, [send]);

  const sendPlayerFinished = useCallback((finishTime: number | null, skillScore: number = 0) => {
    send({ type: 'player-finished', finishTime, skillScore });
  }, [send]);

  const playAgain = useCallback(() => {
    send({ type: 'play-again' });
  }, [send]);

  const requestNewLevel = useCallback(() => {
    send({ type: 'request-new-level' });
  }, [send]);

  const sendLineAdd = useCallback((line: Line) => {
    send({ type: 'line-add', line });
  }, [send]);

  const sendLineRemove = useCallback((lineId: string) => {
    send({ type: 'line-remove', lineId });
  }, [send]);

  const sendLinesClear = useCallback(() => {
    send({ type: 'lines-clear' });
  }, [send]);

  const sendSkierPosition = useCallback((state: SkierRenderState, runState: SkierState) => {
    send({ type: 'skier-position', state, runState });
  }, [send]);

  const onMessage = useCallback((handler: (data: unknown) => void) => {
    messageHandlerRef.current = handler;
  }, []);

  const localPlayer = players.find(p => p.id === playerId) ?? null;

  return { 
    isConnected, 
    playerId, 
    localPlayer, 
    players,
    gamePhase,
    level, 
    roundStartTime,
    currentRound,
    totalRounds,
    gameMode,
    roundOptions,
    remoteLines,
    remoteSkiers,
    setReady,
    setTotalRoundsOption,
    setGameMode,
    sendPlayerFinished,
    playAgain,
    requestNewLevel,
    sendLineAdd,
    sendLineRemove,
    sendLinesClear,
    sendSkierPosition,
    onMessage,
  };
}
