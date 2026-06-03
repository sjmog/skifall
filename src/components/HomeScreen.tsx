import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { generateRoomCode, isValidRoomCode } from '../lib/room-codes';
import { audioManager } from '../lib/audio';
import { MenuButton } from './MenuButton';
import { SkierAvatar } from './SkierAvatar';
import type { Player } from '../hooks/usePartySocket';
import type { GameMode } from '../types';
import backgroundGif from '../assets/images/homepage chalet advanced.gif';
import logoImage from '../assets/images/skifall_logo_transparent.png';
import hostGameBtn from '../assets/images/host-game.png';
import joinLobbyBtn from '../assets/images/join-lobby.png';
import './HomeScreen.css';

interface HomeScreenProps {
  onJoinRoom: (roomId: string) => void;
  hasStarted: boolean;
  onStart: () => void;
  isInLobby?: boolean;
  roomCode?: string;
  players?: Player[];
  localPlayerId?: string | null;
  totalRounds?: number;
  gameMode?: GameMode;
  roundOptions?: number[];
  onSetReady?: (isReady: boolean) => void;
  onSetTotalRounds?: (rounds: number) => void;
  onSetGameMode?: (mode: GameMode) => void;
}

const GAME_MODE_TOOLTIPS: Record<GameMode, string> = {
  downhill: "It's a race down official SkiFall levels - watch out for hazards!",
  freestyle: 'Create your own slopes to get to the bottom before everyone else!',
};

export function HomeScreen({ 
  onJoinRoom, 
  hasStarted, 
  onStart,
  isInLobby = false,
  roomCode: lobbyRoomCode = '',
  players = [],
  localPlayerId,
  totalRounds = 5,
  gameMode = 'downhill',
  roundOptions = [3, 5, 7, 10],
  onSetReady,
  onSetTotalRounds,
  onSetGameMode,
}: HomeScreenProps) {
  const [mode, setMode] = useState<'home' | 'join'>('home');
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleStart = () => {
    onStart();
    audioManager.play('start');
  };

  const handleHostGame = () => {
    const code = generateRoomCode();
    onJoinRoom(code);
  };

  const handleJoinSubmit = () => {
    const code = joinRoomCode.toLowerCase().trim();
    if (!isValidRoomCode(code)) {
      setError('Invalid code format');
      return;
    }
    setError('');
    onJoinRoom(code);
  };

  const handleBack = () => {
    setMode('home');
    setJoinRoomCode('');
    setError('');
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(lobbyRoomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Lobby state
  const localPlayer = players.find(p => p.id === localPlayerId);
  const isReady = localPlayer?.isReady ?? false;
  const allReady = players.length > 0 && players.every(p => p.isReady);
  const readyCount = players.filter(p => p.isReady).length;

  // Determine logo state: 'splash' -> 'menu' -> 'lobby'
  const logoState = !hasStarted ? 'splash' : isInLobby ? 'lobby' : 'menu';
  const showButtons = hasStarted && !isInLobby && mode === 'home';

  return (
    <div className="home-screen">
      <div 
        className="background-layer"
        style={{ backgroundImage: `url(${backgroundGif})` }}
      />

      {/* Single logo that transitions between states */}
      <img 
        src={logoImage} 
        alt="SKI FALL" 
        className={`home-logo logo-${logoState}`} 
      />

      {/* Start overlay - always in DOM, fades out */}
      <div 
        className={`start-overlay ${hasStarted ? 'hidden' : ''}`} 
        onClick={!hasStarted ? handleStart : undefined}
      >
        <div className="click-to-start">Click to Start</div>
      </div>

      {/* Content layer - always in DOM */}
      <div className={`content-layer ${isInLobby ? 'lobby-mode' : ''} ${hasStarted ? 'visible' : ''}`}>
        {/* Menu buttons - animated with framer-motion */}
        <AnimatePresence>
          {showButtons && (
            <div className="floating-buttons">
              <MenuButton src={hostGameBtn} alt="Host Game" onClick={handleHostGame} delay={0.3} />
              <MenuButton src={joinLobbyBtn} alt="Join Lobby" onClick={() => setMode('join')} delay={0.45} />
            </div>
          )}
        </AnimatePresence>

        {/* Join panel */}
        <div className={`floating-panel ${mode !== 'join' || isInLobby ? 'hidden' : ''}`}>
          <label className="input-label">type in your code</label>
          <input
            type="text"
            className="room-input"
            placeholder="verbier-matterhorn"
            value={joinRoomCode}
            onChange={(e) => setJoinRoomCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinSubmit()}
          />
          {error && <p className="error-text">{error}</p>}
          <div className="panel-buttons">
            <button className="floating-btn secondary small" onClick={handleBack}>← Back</button>
            <button className="floating-btn primary small" onClick={handleJoinSubmit}>Join →</button>
          </div>
        </div>

        {/* Lobby content - always in DOM, animated in when in lobby */}
        <div className={`lobby-content ${isInLobby ? 'visible' : ''}`}>
          <div className="lobby-room-code" onClick={handleCopyCode}>
            <span className="lobby-code-value">{lobbyRoomCode}</span>
            <span className={`lobby-copy-hint ${copied ? 'copied' : ''}`}>
              {copied ? '✓ copied!' : 'click to copy'}
            </span>
          </div>

          <div className="lobby-players">
            <div className="lobby-section-title">Players ({players.length})</div>
            <div className="lobby-player-list">
              {players.map(player => {
                const isLocal = player.id === localPlayerId;
                return (
                  <div 
                    key={player.id} 
                    className={`lobby-player ${player.isReady ? 'ready' : ''} ${isLocal ? 'local' : ''}`}
                  >
                    <SkierAvatar character={player.character} size={40} />
                    <span className="lobby-player-name">{isLocal ? 'You' : player.name}</span>
                    <span className={`lobby-ready-badge ${player.isReady ? 'ready' : ''}`}>
                      {player.isReady ? '✓' : '...'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lobby-settings">
            <div className="lobby-section-title">Rounds</div>
            <div className="lobby-round-options">
              {roundOptions.map(option => (
                <button
                  key={option}
                  className={`lobby-round-btn ${totalRounds === option ? 'selected' : ''}`}
                  onClick={() => onSetTotalRounds?.(option)}
                  disabled={isReady}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="lobby-setting-divider" />
            <div className="lobby-section-title">Game Mode</div>
            <div className="lobby-toggle-options">
              <button
                className={`lobby-toggle-btn ${gameMode === 'downhill' ? 'selected' : ''}`}
                onClick={() => onSetGameMode?.('downhill')}
                disabled={isReady}
                data-tooltip={GAME_MODE_TOOLTIPS.downhill}
                title={GAME_MODE_TOOLTIPS.downhill}
              >
                Downhill
              </button>
              <button
                className={`lobby-toggle-btn ${gameMode === 'freestyle' ? 'selected' : ''}`}
                onClick={() => onSetGameMode?.('freestyle')}
                disabled={isReady}
                data-tooltip={GAME_MODE_TOOLTIPS.freestyle}
                title={GAME_MODE_TOOLTIPS.freestyle}
              >
                Freestyle
              </button>
            </div>
          </div>

          <button
            className={`lobby-ready-button ${isReady ? 'is-ready' : ''}`}
            onClick={() => onSetReady?.(!isReady)}
          >
            {isReady ? 'Cancel' : "I'm Ready!"}
          </button>
          <div className="lobby-status">
            {allReady ? 'Starting game...' : `${readyCount}/${players.length} ready`}
          </div>
        </div>
      </div>
    </div>
  );
}



