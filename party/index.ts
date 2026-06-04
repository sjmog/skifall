import type { Party, PartyKitServer, Connection } from "partykit/server";
import { generatePlayerName } from "./player-names";
import { generateLevel, type Level, type LevelDifficulty } from "./level-generator";
import {
  normalizeLevelBankDocument,
  type LevelBankLevel,
  type LevelBankResponse,
} from "../src/lib/level-bank";

const PLAYER_COLORS = [
  "#E11D48", // red
  "#2563EB", // blue
  "#16A34A", // green
  "#F59E0B", // orange
];

const PLAYER_AVATARS = [
  "🦊", "🐺", "🦅", "🐻", "🦌", "🐱", "🐶", "🦁",
  "🐯", "🐨", "🐼", "🦝", "🐮", "🐷", "🐸", "🐵",
];

const DEFAULT_TOTAL_ROUNDS = 5;
const ROUND_OPTIONS = [3, 5, 7, 10];
const DEFAULT_GAME_MODE: GameMode = 'downhill';
const LEVEL_BANK_API_URL = 'https://ski-fall.com/.netlify/functions/levels';

type GamePhase = 'lobby' | 'playing' | 'round-complete' | 'game-over';
type GameMode = 'downhill' | 'freestyle';

interface RoundResult {
  finishTime: number | null; // null = DNF
  score: number;
  skillScore: number;
}

interface PlayerState {
  id: string;
  name: string;
  color: string;
  avatar: string;
  character: number; // 1-4 for different skier sprites
  isReady: boolean;
  isSpectating: boolean;
  roundResult: RoundResult | null;
  totalScore: number;
}

interface Point {
  x: number;
  y: number;
}

interface Line {
  id: string;
  points: Point[];
  playerId: string;
}

function calculateScore(finishTime: number | null, skillScore: number = 0): number {
  if (finishTime === null) return 0;
  const timeScore = Math.max(0, 100 - Math.floor(finishTime));
  return timeScore + skillScore;
}

function getDifficultyForRound(
  currentRound: number,
  totalRounds: number
): LevelDifficulty {
  const roundProgress = (currentRound - 1) / Math.max(totalRounds - 1, 1);

  if (roundProgress < 1 / 3) return 'easy';
  if (roundProgress < 2 / 3) return 'medium';
  return 'hard';
}

function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function cloneFeatures(features: LevelBankLevel['data']['blackLines']) {
  return features.map((feature) => ({
    ...feature,
    points: feature.points.map(clonePoint),
  }));
}

function levelFromBankLevel(level: LevelBankLevel): Level | null {
  const { metadata, data } = level;
  if (!data.start || !data.finish) return null;

  const blackLines = cloneFeatures(data.blackLines);
  const greyLines = cloneFeatures(data.greyLines);

  return {
    id: `${metadata.levelId}-${crypto.randomUUID()}`,
    templateId: metadata.levelId,
    name: metadata.name,
    owners: [...metadata.owners],
    difficulty: metadata.difficulty,
    metadata: {
      ...metadata,
      image: { ...metadata.image },
      owners: [...metadata.owners],
      tags: [...metadata.tags],
    },
    data: {
      start: clonePoint(data.start),
      finish: clonePoint(data.finish),
      blackLines,
      greyLines,
    },
    start: clonePoint(data.start),
    finish: clonePoint(data.finish),
    features: [...blackLines, ...greyLines],
  };
}

async function generateDownhillLevel(
  roundIndex: number,
  difficulty: LevelDifficulty
): Promise<Level> {
  try {
    const response = await fetch(LEVEL_BANK_API_URL, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Level bank responded with ${response.status}`);
    }

    const payload = await response.json() as LevelBankResponse;
    const document = normalizeLevelBankDocument(payload.document);
    const publishedLevels = document.levels.filter((level) => (
      level.metadata.status === 'published' &&
      level.data.start &&
      level.data.finish
    ));
    const difficultyLevels = publishedLevels.filter((level) => (
      level.metadata.difficulty === difficulty
    ));
    const levelBank = difficultyLevels.length > 0 ? difficultyLevels : publishedLevels;
    const selectedLevel = levelBank[roundIndex % Math.max(levelBank.length, 1)];
    const generatedLevel = selectedLevel ? levelFromBankLevel(selectedLevel) : null;

    if (generatedLevel) return generatedLevel;
  } catch (error) {
    console.warn(
      '[SkiFall] Falling back to static downhill level:',
      error instanceof Error ? error.message : error
    );
  }

  return generateLevel(true, roundIndex, difficulty);
}

export default class SkiFallServer implements PartyKitServer {
  players: Map<string, PlayerState> = new Map();
  lines: Map<string, Line> = new Map();
  
  gamePhase: GamePhase = 'lobby';
  level: Level | null = null;
  roundStartTime: number | null = null;
  currentRound: number = 0;
  totalRounds: number = DEFAULT_TOTAL_ROUNDS;
  gameMode: GameMode = DEFAULT_GAME_MODE;

  constructor(readonly room: Party) {}

  getActivePlayers(): PlayerState[] {
    return Array.from(this.players.values()).filter(p => !p.isSpectating);
  }

  broadcastGameState() {
    this.room.broadcast(JSON.stringify({
      type: 'game-state',
      gamePhase: this.gamePhase,
      players: Array.from(this.players.values()),
      level: this.level,
      roundStartTime: this.roundStartTime,
      currentRound: this.currentRound,
      totalRounds: this.totalRounds,
      gameMode: this.gameMode,
    }));
  }

  checkAllPlayersReady(): boolean {
    const active = this.getActivePlayers();
    return active.length > 0 && active.every(p => p.isReady);
  }

  checkAllPlayersFinished(): boolean {
    const active = this.getActivePlayers();
    return active.length > 0 && active.every(p => p.roundResult !== null);
  }

  async startRound() {
    this.currentRound++;
    const difficulty = this.gameMode === 'downhill'
      ? getDifficultyForRound(this.currentRound, this.totalRounds)
      : undefined;
    this.level = this.gameMode === 'downhill'
      ? await generateDownhillLevel(this.currentRound - 1, difficulty)
      : generateLevel(false);
    this.roundStartTime = Date.now();
    this.lines.clear();
    
    for (const player of this.players.values()) {
      player.isReady = false;
      player.roundResult = null;
      if (player.isSpectating) {
        player.isSpectating = false;
      }
    }
    
    this.gamePhase = 'playing';
    this.broadcastGameState();
  }

  endRound() {
    for (const player of this.players.values()) {
      player.isReady = false;
    }
    this.gamePhase = 'round-complete';
    this.broadcastGameState();
  }

  endGame() {
    this.gamePhase = 'game-over';
    this.broadcastGameState();
  }

  resetToLobby() {
    this.gamePhase = 'lobby';
    this.currentRound = 0;
    this.level = null;
    this.roundStartTime = null;
    this.lines.clear();
    
    for (const player of this.players.values()) {
      player.isReady = false;
      player.isSpectating = false;
      player.roundResult = null;
      player.totalScore = 0;
    }
    
    this.broadcastGameState();
  }

  onConnect(conn: Connection) {
    if (this.players.size === 0 && this.gamePhase !== 'lobby') {
      this.gamePhase = 'lobby';
      this.currentRound = 0;
      this.level = null;
      this.roundStartTime = null;
      this.lines.clear();
    }
    
    const playerIndex = this.players.size;
    const isSpectating = this.gamePhase === 'playing';
    
    const player: PlayerState = {
      id: conn.id,
      name: generatePlayerName(),
      color: PLAYER_COLORS[playerIndex % PLAYER_COLORS.length],
      avatar: PLAYER_AVATARS[playerIndex % PLAYER_AVATARS.length],
      character: (playerIndex % 4) + 1, // 1-4 for skier sprites
      isReady: false,
      isSpectating,
      roundResult: null,
      totalScore: 0,
    };
    
    this.players.set(conn.id, player);
    
    conn.send(JSON.stringify({
      type: "welcome",
      playerId: conn.id,
      gamePhase: this.gamePhase,
      players: Array.from(this.players.values()),
      level: this.level,
      roundStartTime: this.roundStartTime,
      currentRound: this.currentRound,
      totalRounds: this.totalRounds,
      gameMode: this.gameMode,
      lines: Array.from(this.lines.values()),
      roundOptions: ROUND_OPTIONS,
    }));
    
    this.room.broadcast(
      JSON.stringify({
        type: "player-joined",
        player,
        players: Array.from(this.players.values()),
      }),
      [conn.id]
    );
  }

  async onClose(conn: Connection) {
    this.players.delete(conn.id);
    
    const removedLineIds: string[] = [];
    for (const [lineId, line] of this.lines) {
      if (line.playerId === conn.id) {
        this.lines.delete(lineId);
        removedLineIds.push(lineId);
      }
    }
    
    this.room.broadcast(
      JSON.stringify({
        type: "player-left",
        playerId: conn.id,
        players: Array.from(this.players.values()),
        removedLineIds,
      })
    );

    // Check if game state should change due to player leaving
    if (this.gamePhase === 'lobby' && this.checkAllPlayersReady()) {
      await this.startRound();
    } else if (this.gamePhase === 'playing' && this.checkAllPlayersFinished()) {
      this.endRound();
    } else if (this.gamePhase === 'round-complete' && this.checkAllPlayersReady()) {
      if (this.currentRound >= this.totalRounds) {
        this.endGame();
      } else {
        await this.startRound();
      }
    }
  }

  async onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Connection) {
    if (typeof message !== 'string') return;
    
    try {
      const data = JSON.parse(message);
      const player = this.players.get(sender.id);
      if (!player) return;
      
      if (data.type === 'set-ready') {
        player.isReady = data.isReady;
        
        if (this.gamePhase === 'lobby' && this.checkAllPlayersReady()) {
          await this.startRound();
        } else if (this.gamePhase === 'round-complete' && this.checkAllPlayersReady()) {
          if (this.currentRound >= this.totalRounds) {
            this.endGame();
          } else {
            await this.startRound();
          }
        } else {
          this.broadcastGameState();
        }
        return;
      }
      
      if (data.type === 'set-total-rounds') {
        if (this.gamePhase === 'lobby' && !player.isReady && ROUND_OPTIONS.includes(data.totalRounds)) {
          this.totalRounds = data.totalRounds;
          this.broadcastGameState();
        }
        return;
      }

      if (data.type === 'set-game-mode') {
        if (
          this.gamePhase === 'lobby' &&
          !player.isReady &&
          (data.gameMode === 'downhill' || data.gameMode === 'freestyle')
        ) {
          this.gameMode = data.gameMode;
          this.broadcastGameState();
        }
        return;
      }

      if (data.type === 'set-use-pregenerated-levels') {
        if (this.gamePhase === 'lobby' && !player.isReady) {
          this.gameMode = data.usePregeneratedLevels ? 'downhill' : 'freestyle';
          this.broadcastGameState();
        }
        return;
      }
      
      if (data.type === 'player-finished') {
        if (this.gamePhase === 'playing' && !player.isSpectating && !player.roundResult) {
          const finishTime = data.finishTime; // null for DNF
          const skillScore = data.skillScore || 0;
          const score = calculateScore(finishTime, skillScore);
          player.roundResult = { finishTime, score, skillScore };
          player.totalScore += score;
          
          this.room.broadcast(JSON.stringify({
            type: 'player-finished',
            playerId: sender.id,
            roundResult: player.roundResult,
            totalScore: player.totalScore,
          }));
          
          if (this.checkAllPlayersFinished()) {
            this.endRound();
          }
        }
        return;
      }
      
      if (data.type === 'play-again') {
        if (this.gamePhase === 'game-over') {
          this.resetToLobby();
        }
        return;
      }
      
      if (data.type === 'request-new-level') {
        // Dev mode: force new level
        const difficulty = this.gameMode === 'downhill'
          ? getDifficultyForRound(Math.max(this.currentRound, 1), this.totalRounds)
          : undefined;
        this.level = this.gameMode === 'downhill'
          ? await generateDownhillLevel(this.currentRound, difficulty)
          : generateLevel(false);
        this.roundStartTime = Date.now();
        this.lines.clear();
        for (const p of this.players.values()) {
          p.roundResult = null;
        }
        this.room.broadcast(JSON.stringify({
          type: 'level-update',
          level: this.level,
          roundStartTime: this.roundStartTime,
        }));
        return;
      }
      
      if (data.type === 'line-add') {
        if (player.isSpectating) return;
        const line: Line = {
          id: data.line.id,
          points: data.line.points,
          playerId: sender.id,
        };
        this.lines.set(line.id, line);
        this.room.broadcast(JSON.stringify({
          type: 'line-add',
          line,
        }), [sender.id]);
        return;
      }
      
      if (data.type === 'line-remove') {
        const existingLine = this.lines.get(data.lineId);
        if (existingLine && existingLine.playerId === sender.id) {
          this.lines.delete(data.lineId);
          this.room.broadcast(JSON.stringify({
            type: 'line-remove',
            lineId: data.lineId,
          }), [sender.id]);
        }
        return;
      }
      
      if (data.type === 'lines-clear') {
        for (const [lineId, line] of this.lines) {
          if (line.playerId === sender.id) {
            this.lines.delete(lineId);
          }
        }
        this.room.broadcast(JSON.stringify({
          type: 'lines-clear',
          playerId: sender.id,
        }), [sender.id]);
        return;
      }
      
      if (data.type === 'skier-position') {
        if (player.isSpectating) return;
        this.room.broadcast(JSON.stringify({
          type: 'skier-position',
          playerId: sender.id,
          state: data.state,
          runState: data.runState,
        }), [sender.id]);
        return;
      }
      
      this.room.broadcast(message, [sender.id]);
    } catch {
      // Invalid JSON, ignore
    }
  }
}
