import { useRef, useEffect, useCallback, useState } from "react";
import type { Tool } from "../types";
import { useLocalPlayer } from "../hooks/useLocalPlayer";
import { useGameState } from "../hooks/useGameState";
import { useCamera } from "../hooks/useCamera";
import { useTimer } from "../hooks/useTimer";
import { useSkillTracker } from "../hooks/useSkillTracker";
import { Toolbar } from "./Toolbar";
import { Timer } from "./Timer";
import { RoundComplete } from "./RoundComplete";
import { SkillDisplay } from "./SkillDisplay";
import {
  COLORS,
  PLAYING_ZOOM,
  FINISH_ZONE_RADIUS,
  DEV_MODE,
  ANIM_SPEED,
  GHOST_LERP_SPEED,
  SKIER_BROADCAST_INTERVAL,
  COUNTDOWN_SECONDS,
  ROUND_DURATION_SECONDS,
} from "../lib/constants";
import { DevMenu } from "./DevMenu";
import {
  drawGrid,
  drawMarker,
  drawLines,
  drawLevelFeatures,
  drawLine,
  applyCameraTransform,
  calculateFitBounds,
} from "../lib/renderer";
import { drawSkier, drawGhostSkier, setSkierCharacter } from "../lib/skier";
import startBtnImg from "../assets/images/start.png";
import resetBtnImg from "../assets/images/reset.png";
import type { SkierCharacter } from "../lib/sprites";
import {
  isAnimationDone,
  animateToward,
  lerpPositionable,
} from "../lib/animation";
import "./GameCanvas.css";

import type { Level } from "../lib/level-generator";
import type { Line, SkierRenderState, SkierState } from "../types";
import type {
  RemoteLine,
  Player,
  RemoteSkier,
  GamePhase,
} from "../hooks/usePartySocket";

type TransitionPhase =
  | "idle"
  | "skier-out"
  | "portals-out"
  | "camera-move"
  | "portals-in"
  | "skier-in"
  | "zoom-in";

function lerpSkierState(
  current: SkierRenderState,
  target: SkierRenderState,
  t: number
): SkierRenderState {
  return {
    head: lerpPositionable(current.head, target.head, t),
    upper: lerpPositionable(current.upper, target.upper, t),
    lower: lerpPositionable(current.lower, target.lower, t),
    skis: lerpPositionable(current.skis, target.skis, t),
    crashed: target.crashed,
  };
}

interface GameCanvasProps {
  serverLevel?: Level | null;
  serverRoundStartTime?: number | null;
  remoteLines?: RemoteLine[];
  remoteSkiers?: Map<string, RemoteSkier>;
  players?: Player[];
  localPlayer?: Player | null;
  hoveredPlayerId?: string | null;
  gamePhase?: GamePhase;
  currentRound?: number;
  totalRounds?: number;
  onRequestNewLevel?: () => void;
  onLineAdd?: (line: Line) => void;
  onLineRemove?: (lineId: string) => void;
  onSkierPosition?: (state: SkierRenderState, runState: SkierState) => void;
  onPlayerFinished?: (finishTime: number | null, skillScore: number) => void;
  onSetReady?: (isReady: boolean) => void;
  onPlayAgain?: () => void;
}

export function GameCanvas({
  serverLevel,
  serverRoundStartTime,
  remoteLines = [],
  remoteSkiers = new Map(),
  players = [],
  localPlayer,
  hoveredPlayerId,
  gamePhase = "playing",
  currentRound = 1,
  totalRounds = 5,
  onRequestNewLevel,
  onLineAdd,
  onLineRemove,
  onSkierPosition,
  onPlayerFinished,
  onSetReady,
  onPlayAgain,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(0);

  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [currentTool, setCurrentTool] = useState<Tool>("hand");
  const [isPanning, setIsPanning] = useState(false);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);

  const [skierScale, setSkierScale] = useState(0);
  const [skierVisible, setSkierVisible] = useState(true);
  const [portalScale, setPortalScale] = useState(0);
  const [transitionPhase, setTransitionPhase] =
    useState<TransitionPhase>("portals-in");

  const skierScaleTarget = useRef<number | null>(null);
  const portalScaleTarget = useRef<number | null>(1); // Start with target=1 for intro animation
  const lastSkierBroadcastRef = useRef<number>(0);
  const interpolatedSkiersRef = useRef<Map<string, SkierRenderState>>(
    new Map()
  );

  const gameState = useGameState(serverLevel);
  const { player, actions } = useLocalPlayer();
  const camera = useCamera(gameState.level.start);
  const timer = useTimer();
  const skillTracker = useSkillTracker();

  const level = gameState.level;
  const setGameLevel = gameState.setLevel;
  const levelKey = level.id;
  const pendingServerLevelRef = useRef<typeof serverLevel>(null);
  const lastSyncedLevelRef = useRef<string | null>(null);
  const hasAppliedServerLevelRef = useRef(Boolean(serverLevel));

  // Set local player's character sprite
  useEffect(() => {
    if (localPlayer?.character) {
      setSkierCharacter(localPlayer.character as SkierCharacter);
    }
  }, [localPlayer?.character]);

  useEffect(() => {
    if (!serverLevel || serverLevel.id === level.id) return;

    if (!hasAppliedServerLevelRef.current) {
      pendingServerLevelRef.current = null;
      hasAppliedServerLevelRef.current = true;
      setGameLevel(serverLevel);
      return;
    }

    if (transitionPhase !== "idle") return;

    pendingServerLevelRef.current = serverLevel;
    actions.reset(level.start.x, level.start.y);
    timer.stop();
    skillTracker.reset();
    setTransitionPhase("skier-out");
    skierScaleTarget.current = 0;
    onSkierPosition?.(player.skierRenderState, "idle");
  }, [
    serverLevel,
    level.id,
    transitionPhase,
    actions,
    level.start,
    timer,
    skillTracker,
    onSkierPosition,
    player.skierRenderState,
    setGameLevel,
  ]);

  useEffect(() => {
    if (serverLevel?.id === levelKey) {
      hasAppliedServerLevelRef.current = true;
    }

    if (lastSyncedLevelRef.current === levelKey) return;
    lastSyncedLevelRef.current = levelKey;

    actions.initAtSpawn(level.start.x, level.start.y);
    actions.setTerrainLines(
      level.features
        .filter((feature) => feature.kind === "solid")
        .map((feature) => ({ id: feature.id, points: feature.points }))
    );

    const bounds = calculateFitBounds(
      level.start,
      level.finish,
      canvasSize.width,
      canvasSize.height,
      150,
      level.features.flatMap((feature) => feature.points)
    );
    camera.setCamera({
      x: bounds.centerX,
      y: bounds.centerY,
      zoom: bounds.zoom,
    });

    // Sync timer: either to server time (joining mid-game) or fresh start
    if (serverRoundStartTime) {
      timer.syncToServerTime(serverRoundStartTime);
    } else {
      timer.reset();
      timer.start();
    }
  }, [
    levelKey,
    actions,
    level.start,
    level.finish,
    level.features,
    canvasSize,
    camera,
    timer,
    serverRoundStartTime,
    serverLevel?.id,
  ]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (transitionPhase === "idle") return;

    if (transitionPhase === "skier-out" && isAnimationDone(skierScale, 0)) {
      setSkierVisible(false);
      setTransitionPhase("portals-out");
      portalScaleTarget.current = 0;
    } else if (
      transitionPhase === "portals-out" &&
      isAnimationDone(portalScale, 0)
    ) {
      const pendingLevel =
        pendingServerLevelRef.current ?? gameState.pendingLevel;
      if (pendingLevel) {
        if (pendingServerLevelRef.current) {
          gameState.setLevel(pendingServerLevelRef.current);
          pendingServerLevelRef.current = null;
        } else {
          gameState.applyPendingLevel();
        }
        actions.clearLines();

        const bounds = calculateFitBounds(
          pendingLevel.start,
          pendingLevel.finish,
          canvasSize.width,
          canvasSize.height,
          150,
          pendingLevel.features.flatMap((feature) => feature.points)
        );
        camera.setCamera({
          x: bounds.centerX,
          y: bounds.centerY,
          zoom: bounds.zoom,
        });
      }
      setTransitionPhase("camera-move");
      setTimeout(() => {
        setTransitionPhase("portals-in");
        portalScaleTarget.current = 1;
      }, 200);
    } else if (
      transitionPhase === "portals-in" &&
      isAnimationDone(portalScale, 1)
    ) {
      setTransitionPhase("skier-in");
      setSkierVisible(true);
      setSkierScale(0);
      skierScaleTarget.current = 1;
    } else if (
      transitionPhase === "skier-in" &&
      isAnimationDone(skierScale, 1)
    ) {
      setTransitionPhase("zoom-in");
      camera.animateToZoom(PLAYING_ZOOM);

      const animateToStart = () => {
        camera.setCamera((prev) => ({
          ...prev,
          x: prev.x + (level.start.x - prev.x) * ANIM_SPEED,
          y: prev.y + (level.start.y - prev.y) * ANIM_SPEED,
        }));
      };
      const interval = setInterval(animateToStart, 16);
      setTimeout(() => {
        clearInterval(interval);
        camera.setCamera((prev) => ({
          ...prev,
          x: level.start.x,
          y: level.start.y,
        }));
        setTransitionPhase("idle");
      }, 500);
    }
  }, [
    transitionPhase,
    skierScale,
    portalScale,
    camera,
    actions,
    canvasSize,
    level.start,
    gameState,
  ]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvasSize;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    applyCameraTransform(ctx, camera.camera, width, height);

    drawGrid(ctx, camera.camera, width, height);
    drawLevelFeatures(ctx, level.features, portalScale);
    drawMarker(ctx, level.start, "START", COLORS.startZone, portalScale);
    drawMarker(ctx, level.finish, "FINISH", COLORS.finishZone, portalScale);

    for (const line of remoteLines) {
      const linePlayer = players.find((p) => p.id === line.playerId);
      const color = linePlayer?.color ?? COLORS.line;
      const isHovered = line.playerId === hoveredPlayerId;
      const opacity = hoveredPlayerId === null ? 0.2 : isHovered ? 0.4 : 0;

      if (opacity > 0) {
        drawLine(ctx, line.points, false, opacity * portalScale, color);
      }
    }

    drawLines(ctx, player.lines, hoveredLineId, portalScale);

    if (player.currentStroke.length > 0) {
      drawLine(ctx, player.currentStroke);
    }

    for (const [playerId, interpolatedState] of interpolatedSkiersRef.current) {
      const skierPlayer = players.find((p) => p.id === playerId);
      if (skierPlayer) {
        const color = skierPlayer.color;
        const opacity = hoveredPlayerId === playerId ? 0.5 : 0.3;
        const character = (skierPlayer.character || 1) as SkierCharacter;
        drawGhostSkier(ctx, interpolatedState, color, opacity * portalScale, character);
      }
    }

    if (skierVisible) {
      drawSkier(ctx, player.skierRenderState, skierScale);
    }

    ctx.restore();
  }, [
    canvasSize,
    camera.camera,
    level,
    player.lines,
    player.currentStroke,
    player.skierRenderState,
    hoveredLineId,
    skierScale,
    skierVisible,
    portalScale,
    remoteLines,
    players,
    hoveredPlayerId,
  ]);

  useEffect(() => {
    const loop = (time: number) => {
      const delta = lastTimeRef.current ? time - lastTimeRef.current : 16.67;
      lastTimeRef.current = time;

      if (
        player.runState === "moving" ||
        player.runState === "fallen" ||
        player.runState === "finished"
      ) {
        const result = actions.update(delta);

        // Update skill tracker with physics state
        if (player.runState === "moving") {
          const physicsState = actions.getPhysicsState();
          if (physicsState) {
            skillTracker.update(physicsState, delta);
          }
        }

        if (player.runState === "moving" && !result.crashed) {
          const dx = result.skis.x - level.finish.x;
          const dy = result.skis.y - (level.finish.y - 20);
          if (dx * dx + dy * dy < FINISH_ZONE_RADIUS * FINISH_ZONE_RADIUS) {
            actions.setRunState("finished");
          }
        }

        camera.followTarget({ x: result.upper.x, y: result.upper.y });

        const now = performance.now();
        if (now - lastSkierBroadcastRef.current >= SKIER_BROADCAST_INTERVAL) {
          lastSkierBroadcastRef.current = now;
          onSkierPosition?.(result, player.runState);
        }
      }

      camera.updateAnimation();

      if (skierScaleTarget.current !== null) {
        setSkierScale((prev) => {
          const { value, done } = animateToward(
            prev,
            skierScaleTarget.current!,
            ANIM_SPEED
          );
          if (done) skierScaleTarget.current = null;
          return value;
        });
      }

      if (portalScaleTarget.current !== null) {
        setPortalScale((prev) => {
          const { value, done } = animateToward(
            prev,
            portalScaleTarget.current!,
            ANIM_SPEED
          );
          if (done) portalScaleTarget.current = null;
          return value;
        });
      }

      for (const [playerId, remoteSkier] of remoteSkiers) {
        const current = interpolatedSkiersRef.current.get(playerId);
        if (current && remoteSkier.runState !== "idle") {
          interpolatedSkiersRef.current.set(
            playerId,
            lerpSkierState(current, remoteSkier.state, GHOST_LERP_SPEED)
          );
        } else if (remoteSkier.runState !== "idle") {
          interpolatedSkiersRef.current.set(playerId, remoteSkier.state);
        } else {
          interpolatedSkiersRef.current.delete(playerId);
        }
      }

      for (const playerId of interpolatedSkiersRef.current.keys()) {
        if (!remoteSkiers.has(playerId)) {
          interpolatedSkiersRef.current.delete(playerId);
        }
      }

      render();
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
    };
  }, [
    player.runState,
    actions,
    camera,
    render,
    level.finish,
    onSkierPosition,
    remoteSkiers,
    skillTracker,
  ]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (player.runState === "moving" || transitionPhase !== "idle") return;
      if (camera.isPinching()) return; // Don't interfere with pinch gesture
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      if (currentTool === "hand") {
        camera.handlePanStart(e.clientX, e.clientY);
        setIsPanning(true);
      } else if (currentTool === "pencil") {
        actions.startDrawing(camera.screenToWorld(e.clientX, e.clientY, rect));
      } else if (currentTool === "eraser") {
        const point = camera.screenToWorld(e.clientX, e.clientY, rect);
        const erasedId = actions.eraseLine(point);
        if (erasedId) {
          onLineRemove?.(erasedId);
        }
      }
    },
    [
      player.runState,
      transitionPhase,
      currentTool,
      camera,
      actions,
      onLineRemove,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (player.runState === "moving" || transitionPhase !== "idle") return;
      if (camera.isPinching()) return; // Don't interfere with pinch gesture
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      if (currentTool === "hand") {
        camera.handlePanMove(e.clientX, e.clientY);
        setHoveredLineId(null);
      } else if (currentTool === "pencil") {
        if (player.isDrawing) {
          actions.continueDrawing(
            camera.screenToWorld(e.clientX, e.clientY, rect)
          );
        }
        setHoveredLineId(null);
      } else if (currentTool === "eraser") {
        const point = camera.screenToWorld(e.clientX, e.clientY, rect);
        setHoveredLineId(actions.getLineAtPoint(point));
        if (e.buttons > 0) {
          const erasedId = actions.eraseLine(point);
          if (erasedId) {
            setHoveredLineId(null);
            onLineRemove?.(erasedId);
          }
        }
      }
    },
    [
      player.runState,
      player.isDrawing,
      transitionPhase,
      currentTool,
      camera,
      actions,
      onLineRemove,
    ]
  );

  const handlePointerUp = useCallback(() => {
    if (currentTool === "hand") {
      camera.handlePanEnd();
      setIsPanning(false);
    } else if (currentTool === "pencil") {
      const newLine = actions.endDrawing();
      if (newLine && onLineAdd) {
        onLineAdd(newLine);
      }
    }
  }, [currentTool, camera, actions, onLineAdd]);

  const handleWheelRef = useRef(camera.handleWheel);
  useEffect(() => {
    handleWheelRef.current = camera.handleWheel;
  }, [camera.handleWheel]);

  const handleTouchStartRef = useRef(camera.handleTouchStart);
  const handleTouchMoveRef = useRef(camera.handleTouchMove);
  const handleTouchEndRef = useRef(camera.handleTouchEnd);
  useEffect(() => {
    handleTouchStartRef.current = camera.handleTouchStart;
    handleTouchMoveRef.current = camera.handleTouchMove;
    handleTouchEndRef.current = camera.handleTouchEnd;
  }, [camera.handleTouchStart, camera.handleTouchMove, camera.handleTouchEnd]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const onWheel = (e: WheelEvent) => handleWheelRef.current(e);
    const onTouchStart = (e: TouchEvent) => {
      if (currentTool === "hand") {
        handleTouchStartRef.current(e);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (currentTool === "hand") {
        handleTouchMoveRef.current(e);
      }
    };
    const onTouchEnd = () => {
      handleTouchEndRef.current();
    };
    
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);
    
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [currentTool]);

  const handleMiddleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (
        e.button === 1 &&
        player.runState !== "moving" &&
        transitionPhase === "idle"
      ) {
        e.preventDefault();
        camera.handlePanStart(e.clientX, e.clientY);
      }
    },
    [camera, player.runState, transitionPhase]
  );

  const handleMiddleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (player.runState !== "moving" && transitionPhase === "idle") {
        camera.handlePanMove(e.clientX, e.clientY);
      }
    },
    [camera, player.runState, transitionPhase]
  );

  const handleMiddleMouseUp = useCallback(
    () => camera.handlePanEnd(),
    [camera]
  );

  const handlePlay = useCallback(() => {
    if (player.runState === "idle" && transitionPhase === "idle") {
      actions.play();
      camera.animateToZoom(PLAYING_ZOOM);
    }
  }, [player.runState, transitionPhase, actions, camera]);

  const handleReset = useCallback(() => {
    if (transitionPhase !== "idle") return;

    actions.reset(level.start.x, level.start.y);
    gameState.resetRound();
    skillTracker.reset();
    onSkierPosition?.(player.skierRenderState, "idle");

    setSkierVisible(false);
    camera.animateToZoom(1);
    camera.setCamera((prev) => ({
      ...prev,
      x: level.start.x,
      y: level.start.y,
    }));

    setTimeout(() => {
      setSkierScale(0);
      setSkierVisible(true);
      skierScaleTarget.current = 1;
    }, 300);
  }, [
    actions,
    camera,
    level.start,
    transitionPhase,
    gameState,
    skillTracker,
    onSkierPosition,
    player.skierRenderState,
  ]);

  const handleNewLevel = useCallback(() => {
    if (transitionPhase !== "idle") return;

    if (onRequestNewLevel) {
      onRequestNewLevel();
    } else {
      gameState.generateNextLevel();
      actions.reset(level.start.x, level.start.y);
      timer.stop();
      setTransitionPhase("skier-out");
      skierScaleTarget.current = 0;
    }
  }, [
    actions,
    level.start,
    transitionPhase,
    timer,
    gameState,
    onRequestNewLevel,
  ]);

  const hasSentFinish = useRef(false);

  useEffect(() => {
    hasSentFinish.current = false;
  }, [levelKey]);

  useEffect(() => {
    if (player.runState === "finished" && !hasSentFinish.current) {
      hasSentFinish.current = true;
      const finishTime = timer.timeElapsed;
      const finalSkillScore = skillTracker.skillScore;
      gameState.finishRound(finishTime, finalSkillScore);
      timer.stop();
      onPlayerFinished?.(finishTime, finalSkillScore);
    }
  }, [player.runState, timer, gameState, onPlayerFinished, skillTracker.skillScore]);

  useEffect(() => {
    // Only DNF if we're in gameplay (not transitioning) and timer expired during this round
    const canDNF = player.runState === "idle" || player.runState === "moving";
    const inGameplay = transitionPhase === "idle" && gamePhase === "playing";
    if (timer.isExpired && canDNF && inGameplay && !hasSentFinish.current) {
      hasSentFinish.current = true;
      actions.setRunState("fallen");
      // DNF gets 0 score but still records any skill points earned
      const finalSkillScore = skillTracker.skillScore;
      gameState.finishRound(null, finalSkillScore);
      onPlayerFinished?.(null, finalSkillScore);
    }
  }, [
    timer.isExpired,
    player.runState,
    transitionPhase,
    gamePhase,
    actions,
    gameState,
    onPlayerFinished,
    skillTracker.skillScore,
  ]);

  const isSpectating = localPlayer?.isSpectating ?? false;
  // Countdown is derived from timer: values > 60 mean we're in countdown phase
  const displayTime = ROUND_DURATION_SECONDS - COUNTDOWN_SECONDS; // 60 seconds
  const countdownValue =
    timer.timeRemaining > displayTime
      ? Math.ceil(timer.timeRemaining - displayTime)
      : null;
  const isTransitioning = transitionPhase !== "idle" || countdownValue !== null;
  const showTimer =
    countdownValue === null &&
    (timer.isRunning ||
      timer.isExpired ||
      player.runState === "finished" ||
      player.runState === "fallen");
  const showScorecard =
    gamePhase === "round-complete" || gamePhase === "game-over";
  const canvasClass = `game-canvas tool-${currentTool}${
    isPanning ? " panning" : ""
  }${hoveredLineId ? " eraser-hover" : ""}${isSpectating ? " spectating" : ""}`;

  return (
    <div className="game-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className={canvasClass}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onMouseDown={handleMiddleMouseDown}
        onMouseMove={handleMiddleMouseMove}
        onMouseUp={handleMiddleMouseUp}
        onMouseLeave={handleMiddleMouseUp}
      />

      {showTimer && (
        <Timer
          timeRemaining={Math.min(timer.timeRemaining, displayTime)}
          isFinished={player.runState === "finished"}
        />
      )}

      {countdownValue !== null && countdownValue <= COUNTDOWN_SECONDS && (
        <div className="countdown-overlay">
          <div className="countdown-number">{countdownValue}</div>
        </div>
      )}

      {DEV_MODE && <DevMenu onNewLevel={handleNewLevel} />}

      {player.runState === "moving" && (
        <SkillDisplay
          score={skillTracker.skillScore}
          events={skillTracker.events}
          camera={camera.camera}
          canvasRect={canvasRef.current?.getBoundingClientRect() ?? null}
        />
      )}

      <div className="top-controls">
        <img
          src={player.runState !== "idle" ? resetBtnImg : startBtnImg}
          alt={player.runState !== "idle" ? "Reset" : "Start"}
          className={`game-btn ${isTransitioning ? "disabled" : ""}`}
          onClick={isTransitioning ? undefined : (player.runState !== "idle" ? handleReset : handlePlay)}
        />
      </div>

      <Toolbar
        currentTool={currentTool}
        skierState={player.runState}
        disabled={isTransitioning}
        onToolChange={(tool) => {
          setCurrentTool(tool);
          setHoveredLineId(null);
        }}
      />

      {showScorecard && (
        <RoundComplete
          players={players}
          localPlayerId={localPlayer?.id ?? null}
          currentRound={currentRound}
          totalRounds={totalRounds}
          isGameOver={gamePhase === "game-over"}
          onReady={() => onSetReady?.(true)}
          onPlayAgain={onPlayAgain}
        />
      )}
    </div>
  );
}
