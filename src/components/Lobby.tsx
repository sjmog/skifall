import { useState } from 'react';
import type { Player } from '../hooks/usePartySocket';
import type { GameMode } from '../types';
import './Lobby.css';

interface LobbyProps {
  roomCode: string;
  players: Player[];
  localPlayerId: string | null;
  totalRounds: number;
  gameMode: GameMode;
  roundOptions: number[];
  onSetReady: (isReady: boolean) => void;
  onSetTotalRounds: (rounds: number) => void;
  onSetGameMode: (mode: GameMode) => void;
}

const GAME_MODE_TOOLTIPS: Record<GameMode, string> = {
  downhill: "It's a race down official SkiFall levels - watch out for hazards!",
  freestyle: 'Create your own slopes to get to the bottom before everyone else!',
};

export function Lobby({
  roomCode,
  players,
  localPlayerId,
  totalRounds,
  gameMode,
  roundOptions,
  onSetReady,
  onSetTotalRounds,
  onSetGameMode,
}: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const localPlayer = players.find(p => p.id === localPlayerId);
  const isReady = localPlayer?.isReady ?? false;
  const allReady = players.length > 0 && players.every(p => p.isReady);
  const readyCount = players.filter(p => p.isReady).length;

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1 className="lobby-title">SKI FALL</h1>
        
        <div className="room-code-section" onClick={handleCopyCode}>
          <span className="room-code-label">Room Code</span>
          <span className="room-code">{roomCode}</span>
          <span className={`copy-hint ${copied ? 'copied' : ''}`}>
            {copied ? '✓ copied!' : 'click to copy'}
          </span>
        </div>

        <div className="players-section">
          <h2 className="section-title">Players ({players.length})</h2>
          <div className="player-list">
            {players.map(player => (
              <div 
                key={player.id} 
                className={`player-row ${player.isReady ? 'ready' : ''} ${player.id === localPlayerId ? 'local' : ''}`}
              >
                <span className="player-avatar" style={{ borderColor: player.color }}>
                  {player.avatar}
                </span>
                <span className="player-name">{player.name}</span>
                <span className={`ready-badge ${player.isReady ? 'ready' : 'not-ready'}`}>
                  {player.isReady ? '✓ Ready' : 'Waiting...'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h2 className="section-title">Settings</h2>
          <div className="setting-row">
            <span className="setting-label">Rounds</span>
            <div className="round-selector">
              {roundOptions.map(option => (
                <button
                  key={option}
                  className={`round-option ${totalRounds === option ? 'selected' : ''}`}
                  onClick={() => onSetTotalRounds(option)}
                  disabled={isReady}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span className="setting-label">Game Mode</span>
            <div className="toggle-selector">
              <button
                className={`toggle-option ${gameMode === 'downhill' ? 'selected' : ''}`}
                onClick={() => onSetGameMode('downhill')}
                disabled={isReady}
                data-tooltip={GAME_MODE_TOOLTIPS.downhill}
                title={GAME_MODE_TOOLTIPS.downhill}
              >
                Downhill
              </button>
              <button
                className={`toggle-option ${gameMode === 'freestyle' ? 'selected' : ''}`}
                onClick={() => onSetGameMode('freestyle')}
                disabled={isReady}
                data-tooltip={GAME_MODE_TOOLTIPS.freestyle}
                title={GAME_MODE_TOOLTIPS.freestyle}
              >
                Freestyle
              </button>
            </div>
          </div>
        </div>

        <div className="ready-section">
          <button
            className={`ready-button ${isReady ? 'is-ready' : ''}`}
            onClick={() => onSetReady(!isReady)}
          >
            {isReady ? 'Cancel Ready' : "I'm Ready!"}
          </button>
          <p className="ready-status">
            {allReady 
              ? 'Starting game...' 
              : `${readyCount}/${players.length} players ready`
            }
          </p>
        </div>
      </div>
    </div>
  );
}
