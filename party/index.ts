import type { Party, PartyKitServer, Connection } from "partykit/server";
import { generatePlayerName } from "./player-names";
import { generateLevel, type Level } from "../src/lib/level-generator";

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

type GamePhase = 'lobby' | 'playing' | 'round-complete' | 'game-over';

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

export default class SkiFallServer implements PartyKitServer {
  players: Map<string, PlayerState> = new Map();
  lines: Map<string, Line> = new Map();
  
  gamePhase: GamePhase = 'lobby';
  level: Level | null = null;
  roundStartTime: number | null = null;
  currentRound: number = 0;
  totalRounds: number = DEFAULT_TOTAL_ROUNDS;

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

  startRound() {
    this.currentRound++;
    this.level = generateLevel(this.currentRound);
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

  onClose(conn: Connection) {
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
      this.startRound();
    } else if (this.gamePhase === 'playing' && this.checkAllPlayersFinished()) {
      this.endRound();
    } else if (this.gamePhase === 'round-complete' && this.checkAllPlayersReady()) {
      if (this.currentRound >= this.totalRounds) {
        this.endGame();
      } else {
        this.startRound();
      }
    }
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Connection) {
    if (typeof message !== 'string') return;
    
    try {
      const data = JSON.parse(message);
      const player = this.players.get(sender.id);
      if (!player) return;
      
      if (data.type === 'set-ready') {
        player.isReady = data.isReady;
        
        if (this.gamePhase === 'lobby' && this.checkAllPlayersReady()) {
          this.startRound();
        } else if (this.gamePhase === 'round-complete' && this.checkAllPlayersReady()) {
          if (this.currentRound >= this.totalRounds) {
            this.endGame();
          } else {
            this.startRound();
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
        this.level = generateLevel(this.currentRound);
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
