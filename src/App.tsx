import { useState, useEffect } from "react";
import { HomeScreen } from "./components/HomeScreen";
import { GameCanvas } from "./components/GameCanvas";
import { PlayerAvatars } from "./components/PlayerAvatars";
import { usePartySocket } from "./hooks/usePartySocket";
import { preloadAllSprites } from "./lib/sprites";
import { audioManager } from "./lib/audio";
import "./App.css";

function App() {
  const getInitialRoom = () => {
    const hash = window.location.hash;
    const match = hash.match(/^#room=(.+)$/);
    return match ? match[1] : null;
  };

  const [roomId, setRoomId] = useState<string | null>(getInitialRoom);
  const [hasStarted, setHasStarted] = useState(false);
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null);

  useEffect(() => {
    preloadAllSprites().catch(console.error);
  }, []);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setRoomId(getInitialRoom());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const {
    isConnected,
    playerId,
    localPlayer,
    players,
    gamePhase,
    level,
    roundStartTime,
    currentRound,
    totalRounds,
    roundOptions,
    remoteLines,
    remoteSkiers,
    setReady,
    setTotalRoundsOption,
    sendPlayerFinished,
    playAgain,
    requestNewLevel,
    sendLineAdd,
    sendLineRemove,
    sendSkierPosition,
  } = usePartySocket(roomId);

  // Switch music based on current screen
  useEffect(() => {
    const isInGame = roomId && isConnected && gamePhase !== 'lobby';
    audioManager.play(isInGame ? 'game' : 'start');
  }, [roomId, isConnected, gamePhase]);

  const handleJoinRoom = (code: string) => {
    window.history.pushState(null, '', `#room=${code}`);
    setRoomId(code);
  };

  // Show lobby in home screen when:
  // - We have a roomId AND we're connected AND in lobby phase
  // - OR we have a roomId but not connected yet (connecting state)
  const isInLobbyPhase = roomId && (!isConnected || gamePhase === 'lobby');

  if (!roomId || isInLobbyPhase) {
    return (
      <>
        <HomeScreen 
          onJoinRoom={handleJoinRoom} 
          hasStarted={hasStarted}
          onStart={() => setHasStarted(true)}
          isInLobby={!!roomId}
          roomCode={roomId ?? ''}
          players={players}
          localPlayerId={playerId}
          totalRounds={totalRounds}
          roundOptions={roundOptions}
          onSetReady={setReady}
          onSetTotalRounds={setTotalRoundsOption}
        />
      </>
    );
  }

  return (
    <>
      <GameCanvas
        serverLevel={level}
        serverRoundStartTime={roundStartTime}
        remoteLines={remoteLines}
        remoteSkiers={remoteSkiers}
        players={players}
        localPlayer={localPlayer}
        hoveredPlayerId={hoveredPlayerId}
        gamePhase={gamePhase}
        currentRound={currentRound}
        totalRounds={totalRounds}
        onRequestNewLevel={requestNewLevel}
        onLineAdd={sendLineAdd}
        onLineRemove={sendLineRemove}
        onSkierPosition={sendSkierPosition}
        onPlayerFinished={sendPlayerFinished}
        onSetReady={setReady}
        onPlayAgain={playAgain}
      />

      {isConnected && (
        <PlayerAvatars 
          players={players} 
          localPlayerId={playerId}
          onHoverPlayer={setHoveredPlayerId}
        />
      )}
    </>
  );
}

export default App;
