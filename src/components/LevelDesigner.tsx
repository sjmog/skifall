import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_LEVEL_OWNER,
  getDefaultLevelImage,
  type LevelDifficulty,
  type LevelFeature,
  type LevelMetadata,
  type Point,
} from '../lib/pregenerated-levels';
import {
  LEVEL_BANK_SITE_NAME,
  cloneLevelBankLevel,
  createSeedLevelBank,
  type LevelBankDocument,
  type LevelBankLevel,
  type LevelBankLevelData,
  type LevelBankResponse,
} from '../lib/level-bank';
import {
  deleteLevelFromLevelBank,
  loadLevelBank,
  saveLevelToLevelBank,
} from '../lib/level-bank-client';
import {
  addLineToWorld,
  createPhysicsEngine,
  getSkierState,
  getSkierPhysicsState,
  resetSkier,
  startSkier,
  stepPhysics,
  type PhysicsEngine,
} from '../lib/physics';
import { getSkierSpriteUrls } from '../lib/sprites';
import { SKIER_SPRITE_OFFSETS, SKIER_SPRITE_SCALE } from '../lib/skier';
import { isPointNearLine, smoothLineWithSpline } from '../lib/line-utils';
import { FINISH_ZONE_RADIUS } from '../lib/constants';
import type { SkierRenderState } from '../types';
import panIcon from '../assets/images/pan.png';
import pencilIcon from '../assets/images/pencil.png';
import eraserIcon from '../assets/images/eraser.png';
import startButtonImage from '../assets/images/start.png';
import './LevelDesigner.css';

type EditableLevelData = LevelBankLevelData;

type StoredUserLevel = LevelBankLevel;

type DesignerLevel = StoredUserLevel & {
  source: 'netlify-blobs' | 'static-seed';
};

type DeleteTarget = DesignerLevel | null;

type CreateMode = 'move' | 'draw' | 'erase' | 'place-start' | 'place-finish';
type DrawLineKind = 'collision' | 'scenery';
type DrawStyle = 'straight' | 'curvy' | 'sketch';
type DesignerScreen = 'menu' | 'editor';
type EditorMode = 'create' | 'test';
type TestStatus = 'ready' | 'running' | 'paused';
type TestBanner = 'complete' | 'crashed' | null;
type MetadataDifficulty = LevelDifficulty | '';

const LEVEL_WIDTH = 19200;
const LEVEL_HEIGHT = 14000;
const MIN_VIEW_WIDTH = 420;
const DEFAULT_VIEW_WIDTH = LEVEL_WIDTH / 10;
const DEFAULT_VIEW_HEIGHT = LEVEL_HEIGHT / 10;
const MAX_HISTORY = 10;
const EDITOR_GRID_SIZE = 600;
const difficultyOptions: LevelDifficulty[] = ['easy', 'medium', 'hard'];
const skierSpriteUrls = getSkierSpriteUrls(1);
const skierSpriteDimensions = {
  head: { width: 238, height: 156 },
  torso: { width: 471, height: 321 },
  legs: { width: 175, height: 189 },
  skis: { width: 265, height: 43 },
};

const createEmptyLevelData = (): EditableLevelData => ({
  start: null,
  finish: null,
  blackLines: [],
  greyLines: [],
});

function createLevelId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = Math.random().toString(36).slice(2, 8);

  return `${slug || 'untitled-level'}-${suffix}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function createFeature(kind: LevelFeature['kind'], points: Point[]): LevelFeature {
  return {
    id: `feature-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    points,
  };
}

function clonePoint(point: Point | null): Point | null {
  return point ? { ...point } : null;
}

function cloneFeature(feature: LevelFeature): LevelFeature {
  return {
    ...feature,
    points: feature.points.map((point) => ({ ...point })),
  };
}

function cloneEditableData(data: EditableLevelData): EditableLevelData {
  return {
    start: clonePoint(data.start),
    finish: clonePoint(data.finish),
    blackLines: data.blackLines.map(cloneFeature),
    greyLines: data.greyLines.map(cloneFeature),
  };
}

function cloneLevelSnapshot(level: StoredUserLevel): LevelSnapshot {
  return {
    metadata: {
      ...level.metadata,
      image: { ...level.metadata.image },
      owners: [...level.metadata.owners],
      tags: [...level.metadata.tags],
    },
    data: cloneEditableData(level.data),
  };
}

function snapshotToLevel(snapshot: LevelSnapshot): StoredUserLevel {
  return {
    metadata: {
      ...snapshot.metadata,
      image: { ...snapshot.metadata.image },
      owners: [...snapshot.metadata.owners],
      tags: [...snapshot.metadata.tags],
    },
    data: cloneEditableData(snapshot.data),
  };
}

function getPointFromSvg(event: { clientX: number; clientY: number }, svg: SVGSVGElement): Point {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());

  return {
    x: Math.max(0, Math.min(LEVEL_WIDTH, transformed.x)),
    y: Math.max(0, Math.min(LEVEL_HEIGHT, transformed.y)),
  };
}

function linePoints(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function getPreviewViewBox(data: EditableLevelData): ViewBox {
  const points = [
    ...(data.start ? [data.start] : []),
    ...(data.finish ? [data.finish] : []),
    ...data.blackLines.flatMap((line) => line.points),
    ...data.greyLines.flatMap((line) => line.points),
  ];

  if (points.length === 0) {
    return { x: 0, y: 0, width: LEVEL_WIDTH, height: LEVEL_HEIGHT };
  }

  const padding = 300;
  const minX = Math.max(0, Math.min(...points.map((point) => point.x)) - padding);
  const maxX = Math.min(LEVEL_WIDTH, Math.max(...points.map((point) => point.x)) + padding);
  const minY = Math.max(0, Math.min(...points.map((point) => point.y)) - padding);
  const maxY = Math.min(LEVEL_HEIGHT, Math.max(...points.map((point) => point.y)) + padding);

  return {
    x: minX,
    y: minY,
    width: Math.max(900, maxX - minX),
    height: Math.max(620, maxY - minY),
  };
}

function getLineForErase(data: EditableLevelData, point: Point): LevelFeature | null {
  const allLines = [...data.blackLines, ...data.greyLines];
  return allLines.find((line) => isPointNearLine(point, line, 22)) ?? null;
}

function getDraftPoints(style: DrawStyle, points: Point[]): Point[] {
  if (points.length < 2) return points;

  if (style === 'straight') {
    return [points[0], points[points.length - 1]];
  }

  if (style === 'curvy') {
    const start = points[0];
    const end = points[points.length - 1];
    const control = {
      x: (start.x + end.x) / 2,
      y: Math.min(start.y, end.y) - 120,
    };
    return smoothLineWithSpline([start, control, end], 10);
  }

  return points;
}

function clampViewBox(viewBox: ViewBox): ViewBox {
  const width = Math.max(MIN_VIEW_WIDTH, Math.min(LEVEL_WIDTH, viewBox.width));
  const height = Math.max((width / LEVEL_WIDTH) * LEVEL_HEIGHT, Math.min(LEVEL_HEIGHT, viewBox.height));

  return {
    x: Math.max(0, Math.min(LEVEL_WIDTH - width, viewBox.x)),
    y: Math.max(0, Math.min(LEVEL_HEIGHT - height, viewBox.y)),
    width,
    height,
  };
}

function getFocusedViewBox(data?: EditableLevelData): ViewBox {
  const center = data?.start ?? { x: LEVEL_WIDTH / 2, y: LEVEL_HEIGHT / 2 };

  return clampViewBox({
    x: center.x - DEFAULT_VIEW_WIDTH / 2,
    y: center.y - DEFAULT_VIEW_HEIGHT / 2,
    width: DEFAULT_VIEW_WIDTH,
    height: DEFAULT_VIEW_HEIGHT,
  });
}

type ViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PanState = {
  pointerId: number;
  clientX: number;
  clientY: number;
  viewBox: ViewBox;
};

type LevelSnapshot = {
  metadata: LevelMetadata;
  data: EditableLevelData;
};

type HistoryState = {
  past: LevelSnapshot[];
  future: LevelSnapshot[];
};

function LevelPreview({ data }: { data: EditableLevelData }) {
  const previewViewBox = getPreviewViewBox(data);

  return (
    <svg
      className="level-preview"
      viewBox={`${previewViewBox.x} ${previewViewBox.y} ${previewViewBox.width} ${previewViewBox.height}`}
      role="img"
      aria-label="Full level preview"
    >
      <rect width={LEVEL_WIDTH} height={LEVEL_HEIGHT} />
      <PreviewGrid />
      <g className="level-preview-grey-lines">
        {data.greyLines.map((line) => (
          <polyline key={line.id} points={linePoints(line.points)} />
        ))}
      </g>
      <g className="level-preview-black-lines">
        {data.blackLines.map((line) => (
          <polyline key={line.id} points={linePoints(line.points)} />
        ))}
      </g>
      {data.start && <circle className="level-preview-start" cx={data.start.x} cy={data.start.y} r="36" />}
      {data.finish && <circle className="level-preview-finish" cx={data.finish.x} cy={data.finish.y} r="36" />}
    </svg>
  );
}

function LevelTileImage({ level }: { level: DesignerLevel }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return <LevelPreview data={level.data} />;
  }

  return (
    <img
      className="level-screenshot"
      src={level.metadata.image.src}
      alt={level.metadata.image.alt}
      onError={() => setImageFailed(true)}
    />
  );
}

function PreviewGrid() {
  return (
    <g className="level-preview-grid">
      {Array.from({ length: Math.ceil(LEVEL_WIDTH / EDITOR_GRID_SIZE) + 1 }, (_, index) => (
        <line key={`vertical-${index}`} x1={index * EDITOR_GRID_SIZE} x2={index * EDITOR_GRID_SIZE} y1="0" y2={LEVEL_HEIGHT} />
      ))}
      {Array.from({ length: Math.ceil(LEVEL_HEIGHT / EDITOR_GRID_SIZE) + 1 }, (_, index) => (
        <line key={`horizontal-${index}`} x1="0" x2={LEVEL_WIDTH} y1={index * EDITOR_GRID_SIZE} y2={index * EDITOR_GRID_SIZE} />
      ))}
    </g>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l11-11-4-4L4 16v4Z" />
      <path d="m14 6 4 4" />
    </svg>
  );
}

function BinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M9 7V5h6v2" />
      <path d="M8 10v9" />
      <path d="M12 10v9" />
      <path d="M16 10v9" />
      <path d="M7 7l1 14h8l1-14" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4h12l2 2v14H5V4Z" />
      <path d="M8 4v6h8V4" />
      <path d="M8 20v-6h8v6" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 8H4v-5" />
      <path d="M4 8c3-4 9-5 13-1 3 3 3 8 0 11-2 2-5 3-8 2" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 8h5v-5" />
      <path d="M20 8c-3-4-9-5-13-1-3 3-3 8 0 11 2 2 5 3 8 2" />
    </svg>
  );
}

function StyleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 15c4-8 7 7 11-1s5 0 7-5" />
    </svg>
  );
}

function PlaceIcon() {
  return <span className="place-heading-icon" aria-hidden="true" />;
}

function ToolGroupHeading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="tool-group-heading">
      <span className="tool-heading-icon">{icon}</span>
      <span>{children}</span>
    </h2>
  );
}

export function LevelDesigner() {
  const [levelBankDocument, setLevelBankDocument] = useState<LevelBankDocument>(() => createSeedLevelBank());
  const [levelBankResponse, setLevelBankResponse] = useState<LevelBankResponse | null>(null);
  const [levelBankLoading, setLevelBankLoading] = useState(true);
  const [levelBankSaving, setLevelBankSaving] = useState(false);
  const [screen, setScreen] = useState<DesignerScreen>('menu');
  const [activeLevel, setActiveLevel] = useState<StoredUserLevel | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [metadataName, setMetadataName] = useState('');
  const [metadataDescription, setMetadataDescription] = useState('');
  const [metadataDifficulty, setMetadataDifficulty] = useState<MetadataDifficulty>('');
  const [metadataError, setMetadataError] = useState('');
  const [createMode, setCreateMode] = useState<CreateMode>('move');
  const [drawLineKind, setDrawLineKind] = useState<DrawLineKind>('collision');
  const [drawStyle, setDrawStyle] = useState<DrawStyle>('straight');
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [viewBox, setViewBox] = useState<ViewBox>(() => getFocusedViewBox());
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [testStatus, setTestStatus] = useState<TestStatus>('ready');
  const [testBanner, setTestBanner] = useState<TestBanner>(null);
  const [testSkier, setTestSkier] = useState<SkierRenderState | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const physicsRef = useRef<PhysicsEngine | null>(null);
  const clickLineStartRef = useRef<Point | null>(null);
  const panStateRef = useRef<PanState | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const testBannerRef = useRef<TestBanner>(null);
  const testRunning = editorMode === 'test' && testStatus === 'running';

  const levels = useMemo<DesignerLevel[]>(() => {
    const source = levelBankResponse?.source ?? 'static-seed';
    return levelBankDocument.levels.map((level) => ({
      ...cloneLevelBankLevel(level),
      source,
    }));
  }, [levelBankDocument, levelBankResponse?.source]);

  useEffect(() => {
    let ignore = false;

    async function fetchLevelBank() {
      setLevelBankLoading(true);
      const response = await loadLevelBank();
      if (ignore) return;

      setLevelBankResponse(response);
      setLevelBankDocument(response.document);
      setLevelBankLoading(false);
      if (!response.serverAvailable) {
        setToast('Using bundled seed levels until the Netlify level bank is available.');
      }
    }

    void fetchLevelBank();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;

    const timeout = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    clickLineStartRef.current = null;
  }, [createMode, drawLineKind, drawStyle, editorMode]);

  const resetView = () => {
    setViewBox(getFocusedViewBox(activeLevel?.data));
  };

  const clearDraftAction = () => {
    clickLineStartRef.current = null;
    setDraftPoints([]);
  };

  const selectCreateMode = (mode: CreateMode) => {
    clearDraftAction();
    setCreateMode(mode);
  };

  const selectDrawKind = (kind: DrawLineKind) => {
    clearDraftAction();
    setCreateMode('draw');
    setDrawLineKind(kind);
  };

  const selectDrawStyle = (style: DrawStyle) => {
    clearDraftAction();
    setCreateMode('draw');
    setDrawStyle(style);
  };

  const zoomView = (direction: 'in' | 'out', focus?: Point) => {
    setViewBox((current) => {
      const factor = direction === 'in' ? 0.78 : 1.22;
      const nextWidth = Math.max(MIN_VIEW_WIDTH, Math.min(LEVEL_WIDTH, current.width * factor));
      const nextHeight = (nextWidth / LEVEL_WIDTH) * LEVEL_HEIGHT;
      const center = focus ?? {
        x: current.x + current.width / 2,
        y: current.y + current.height / 2,
      };
      const focusRatioX = (center.x - current.x) / current.width;
      const focusRatioY = (center.y - current.y) / current.height;

      return clampViewBox({
        x: center.x - nextWidth * focusRatioX,
        y: center.y - nextHeight * focusRatioY,
        width: nextWidth,
        height: nextHeight,
      });
    });
  };

  useEffect(() => {
    if (!testRunning || !physicsRef.current || !activeLevel?.data.finish) return undefined;

    let frameId = 0;
    const tick = (timestamp: number) => {
      if (!physicsRef.current || !activeLevel?.data.finish) return;

      const previous = lastFrameRef.current ?? timestamp;
      const delta = timestamp - previous;
      lastFrameRef.current = timestamp;
      stepPhysics(physicsRef.current, delta);

      const state = getSkierPhysicsState(physicsRef.current);
      setTestSkier(getSkierState(physicsRef.current));

      const finishDistance = Math.hypot(
        state.position.x - activeLevel.data.finish.x,
        state.position.y - (activeLevel.data.finish.y - 20)
      );

      if (finishDistance < FINISH_ZONE_RADIUS) {
        if (testBannerRef.current !== 'complete') {
          testBannerRef.current = 'complete';
          setTestBanner('complete');
        }
      }

      if (state.crashed && testBannerRef.current !== 'complete' && testBannerRef.current !== 'crashed') {
        testBannerRef.current = 'crashed';
        setTestBanner('crashed');
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [activeLevel, testRunning]);

  const editLevelFromOverview = (level: DesignerLevel) => {
    const editableLevel = cloneLevelBankLevel(level);

    setActiveLevel(editableLevel);
    setViewBox(getFocusedViewBox(editableLevel.data));
    setHistory({ past: [], future: [] });
    setEditorMode('create');
    setTestStatus('ready');
    testBannerRef.current = null;
    setTestBanner(null);
    setTestSkier(null);
    clearDraftAction();
    setScreen('editor');
  };

  const applyLevelBankResponse = (response: LevelBankResponse) => {
    setLevelBankResponse(response);
    setLevelBankDocument(response.document);
  };

  const saveLevelToServer = async (level: StoredUserLevel): Promise<LevelBankResponse | null> => {
    setLevelBankSaving(true);
    try {
      const response = await saveLevelToLevelBank(level);
      applyLevelBankResponse(response);
      return response;
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to save level to Netlify.');
      return null;
    } finally {
      setLevelBankSaving(false);
    }
  };

  const confirmDeleteLevel = async () => {
    if (!deleteTarget) return;

    const levelId = deleteTarget.metadata.levelId;
    setLevelBankSaving(true);
    try {
      const response = await deleteLevelFromLevelBank(levelId);
      applyLevelBankResponse(response);

      if (activeLevel?.metadata.levelId === levelId) {
        setActiveLevel(null);
        setScreen('menu');
      }

      setDeleteTarget(null);
      setToast('Level removed from the Netlify level bank.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to delete level from Netlify.');
    } finally {
      setLevelBankSaving(false);
    }
  };

  const updateActiveLevel = (updater: (level: StoredUserLevel) => StoredUserLevel) => {
    setActiveLevel((current) => {
      if (!current) return current;
      return updater(current);
    });
  };

  const recordHistory = () => {
    if (!activeLevel) return;

    setHistory((current) => ({
      past: [cloneLevelSnapshot(activeLevel), ...current.past].slice(0, MAX_HISTORY),
      future: [],
    }));
  };

  const undoLevelAction = () => {
    const [previous, ...remainingPast] = history.past;
    if (!previous || !activeLevel) return;

    setHistory({
      past: remainingPast,
      future: [cloneLevelSnapshot(activeLevel), ...history.future].slice(0, MAX_HISTORY),
    });
    setActiveLevel(snapshotToLevel(previous));
    clickLineStartRef.current = null;
    setDraftPoints([]);
  };

  const redoLevelAction = () => {
    const [next, ...remainingFuture] = history.future;
    if (!next || !activeLevel) return;

    setHistory({
      past: [cloneLevelSnapshot(activeLevel), ...history.past].slice(0, MAX_HISTORY),
      future: remainingFuture,
    });
    setActiveLevel(snapshotToLevel(next));
    clickLineStartRef.current = null;
    setDraftPoints([]);
  };

  const addFeatureToActiveLevel = (feature: LevelFeature) => {
    updateActiveLevel((level) => ({
      ...level,
      data: {
        ...level.data,
        blackLines: feature.kind === 'solid' ? [...level.data.blackLines, feature] : level.data.blackLines,
        greyLines: feature.kind === 'scenery' ? [...level.data.greyLines, feature] : level.data.greyLines,
      },
    }));
  };

  const openCreateModal = () => {
    setMetadataName('');
    setMetadataDescription('');
    setMetadataDifficulty('');
    setMetadataError('');
    setCreateModalOpen(true);
  };

  const openPublishModal = () => {
    if (!activeLevel) return;
    setMetadataName(activeLevel.metadata.name);
    setMetadataDescription(activeLevel.metadata.description ?? '');
    setMetadataDifficulty(activeLevel.metadata.difficulty ?? '');
    setMetadataError('');
    setPublishModalOpen(true);
  };

  const createLevelFromModal = async () => {
    if (!metadataName.trim() || !metadataDescription.trim()) {
      setMetadataError('Name and description are required.');
      return;
    }

    const levelId = createLevelId(metadataName);
    const date = today();
    const level: StoredUserLevel = {
      metadata: {
        levelId,
        name: metadataName.trim(),
        image: getDefaultLevelImage(levelId, metadataName.trim()),
        owners: [DEFAULT_LEVEL_OWNER],
        ...(metadataDifficulty ? { difficulty: metadataDifficulty } : {}),
        status: 'unfinished',
        version: 1,
        tags: ['custom'],
        createdAt: date,
        updatedAt: date,
        description: metadataDescription.trim(),
      },
      data: createEmptyLevelData(),
    };

    const response = await saveLevelToServer(level);
    setActiveLevel(level);
    setViewBox(getFocusedViewBox(level.data));
    setHistory({ past: [], future: [] });
    setScreen('editor');
    setCreateModalOpen(false);
    setEditorMode('create');
    clearDraftAction();
    setToast(response?.serverAvailable ? 'Level shell saved to Netlify.' : 'Level shell created. Save again when Netlify is available.');
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!activeLevel || !svgRef.current) return;

    const point = getPointFromSvg(event, svgRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (editorMode === 'test' || createMode === 'move') {
      panStateRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        viewBox,
      };
      return;
    }

    if (editorMode !== 'create') return;

    if (createMode === 'place-start') {
      recordHistory();
      updateActiveLevel((level) => ({
        ...level,
        data: { ...level.data, start: point },
      }));
      setToast('Start placed.');
      return;
    }

    if (createMode === 'place-finish') {
      recordHistory();
      updateActiveLevel((level) => ({
        ...level,
        data: { ...level.data, finish: point },
      }));
      setToast('Finish placed.');
      return;
    }

    if (createMode === 'erase') {
      const target = getLineForErase(activeLevel.data, point);
      if (!target) return;
      recordHistory();
      updateActiveLevel((level) => ({
        ...level,
        data: {
          ...level.data,
          blackLines: level.data.blackLines.filter((line) => line.id !== target.id),
          greyLines: level.data.greyLines.filter((line) => line.id !== target.id),
        },
      }));
      setHoveredLineId(null);
      setToast('Line removed.');
      return;
    }

    if ((drawStyle === 'straight' || drawStyle === 'curvy') && draftPoints.length === 1) {
      const points = getDraftPoints(drawStyle, [draftPoints[0], point]);
      const kind = drawLineKind === 'collision' ? 'solid' : 'scenery';
      recordHistory();
      addFeatureToActiveLevel(createFeature(kind, points));
      clickLineStartRef.current = null;
      setDraftPoints([]);
      return;
    }

    if (drawStyle === 'straight' || drawStyle === 'curvy') {
      if (clickLineStartRef.current) {
        const points = getDraftPoints(drawStyle, [clickLineStartRef.current, point]);
        const kind = drawLineKind === 'collision' ? 'solid' : 'scenery';
        recordHistory();
        addFeatureToActiveLevel(createFeature(kind, points));
        clickLineStartRef.current = null;
        setDraftPoints([]);
        return;
      }

      clickLineStartRef.current = point;
    }

    setDraftPoints([point]);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!activeLevel || !svgRef.current) return;

    const panState = panStateRef.current;
    if (panState?.pointerId === event.pointerId) {
      const svgRect = svgRef.current.getBoundingClientRect();
      const deltaX = ((event.clientX - panState.clientX) / svgRect.width) * panState.viewBox.width;
      const deltaY = ((event.clientY - panState.clientY) / svgRect.height) * panState.viewBox.height;

      setViewBox(clampViewBox({
        ...panState.viewBox,
        x: panState.viewBox.x - deltaX,
        y: panState.viewBox.y - deltaY,
      }));
      return;
    }

    if (editorMode !== 'create') return;

    const point = getPointFromSvg(event, svgRef.current);

    if (createMode === 'erase') {
      setHoveredLineId(getLineForErase(activeLevel.data, point)?.id ?? null);
      return;
    }

    if (createMode !== 'draw' || draftPoints.length === 0) return;

    if (drawStyle === 'straight' || drawStyle === 'curvy') {
      const start = clickLineStartRef.current ?? draftPoints[0];
      setDraftPoints([start, point]);
      return;
    }

    setDraftPoints((points) => [...points, point]);
  };

  const handlePointerUp = () => {
    if (panStateRef.current) {
      panStateRef.current = null;
      return;
    }

    if (!activeLevel || editorMode !== 'create' || createMode !== 'draw' || draftPoints.length < 2) {
      if (drawStyle === 'straight' || drawStyle === 'curvy') {
        return;
      }
      setDraftPoints([]);
      return;
    }

    const points = getDraftPoints(drawStyle, draftPoints);
    if (points.length < 2) {
      setDraftPoints([]);
      return;
    }

    const kind = drawLineKind === 'collision' ? 'solid' : 'scenery';
    recordHistory();
    addFeatureToActiveLevel(createFeature(kind, points));
    setDraftPoints([]);
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    event.preventDefault();
    zoomView(event.deltaY < 0 ? 'in' : 'out', getPointFromSvg(event, svgRef.current));
  };

  const saveActiveLevel = async (statusOverride?: LevelMetadata['status']) => {
    if (!activeLevel) return;

    const hasRequiredMarkers = Boolean(activeLevel.data.start && activeLevel.data.finish);
    const savedStatus = statusOverride ?? (hasRequiredMarkers ? 'finished' : 'unfinished');
    const updatedLevel: StoredUserLevel = {
      ...activeLevel,
      metadata: {
        ...activeLevel.metadata,
        status: savedStatus,
        updatedAt: today(),
      },
    };

    setActiveLevel(updatedLevel);
    const response = await saveLevelToServer(updatedLevel);
    if (response?.serverAvailable) {
      setToast(savedStatus === 'published' ? 'Level published to the Netlify level bank.' : 'Level saved to Netlify.');
    }
  };

  const publishActiveLevel = async () => {
    if (!activeLevel) return;

    if (!metadataName.trim() || !metadataDescription.trim() || !metadataDifficulty) {
      setMetadataError('Name, description and difficulty are required before publishing.');
      return;
    }

    if (!activeLevel.data.start || !activeLevel.data.finish) {
      setMetadataError('Place both the skier start and finish before publishing.');
      return;
    }

    const updatedLevel: StoredUserLevel = {
      ...activeLevel,
      metadata: {
        ...activeLevel.metadata,
        name: metadataName.trim(),
        description: metadataDescription.trim(),
        difficulty: metadataDifficulty,
        status: 'published',
        updatedAt: today(),
      },
    };

    setActiveLevel(updatedLevel);
    const response = await saveLevelToServer(updatedLevel);
    if (!response?.serverAvailable) return;

    setPublishModalOpen(false);
    setToast('Level published to the Netlify level bank.');
  };

  const resetTestRun = () => {
    if (!activeLevel?.data.start) {
      setToast('Place a skier start before testing.');
      setEditorMode('create');
      return;
    }

    const engine = createPhysicsEngine(activeLevel.data.start.x, activeLevel.data.start.y);
    for (const line of activeLevel.data.blackLines) {
      addLineToWorld(engine, { id: line.id, points: line.points });
    }
    resetSkier(engine);
    physicsRef.current = engine;
    lastFrameRef.current = null;
    testBannerRef.current = null;
    setTestBanner(null);
    setTestSkier(getSkierState(engine));
    setTestStatus('paused');
    setViewBox(getFocusedViewBox(activeLevel.data));
  };

  const enterTestMode = () => {
    if (!activeLevel?.data.start) {
      setToast('Place a skier start before testing.');
      return;
    }

    setEditorMode('test');
    clearDraftAction();
    setViewBox(getFocusedViewBox(activeLevel.data));
    window.setTimeout(resetTestRun, 0);
  };

  const playTestRun = () => {
    if (!physicsRef.current) {
      resetTestRun();
      window.setTimeout(() => {
        if (!physicsRef.current) return;
        lastFrameRef.current = null;
        startSkier(physicsRef.current);
        setTestStatus('running');
      }, 0);
      return;
    }

    lastFrameRef.current = null;
    startSkier(physicsRef.current);
    setTestStatus('running');
  };

  const pauseTestRun = () => {
    lastFrameRef.current = null;
    setTestStatus('paused');
  };

  const returnToCreateMode = () => {
    physicsRef.current = null;
    setEditorMode('create');
    clearDraftAction();
    setTestStatus('ready');
    testBannerRef.current = null;
    setTestBanner(null);
    setTestSkier(null);
  };

  const activeDraftPoints = getDraftPoints(drawStyle, draftPoints);

  if (screen === 'editor' && activeLevel) {
    const data = activeLevel.data;
    const canPublish = Boolean(data.start && data.finish);

    return (
      <main className="level-editor-shell">
        <header className="level-editor-header">
          <button className="text-action" type="button" onClick={() => setScreen('menu')}>
            Back to levels
          </button>
          <div>
            <p className="level-designer-kicker">{editorMode === 'test' ? 'Test run' : 'Create mode'}</p>
            <h1>{activeLevel.metadata.name}</h1>
          </div>
          <div className="editor-header-actions">
            {editorMode === 'create' && (
              <>
                <button
                  className="nav-icon-action"
                  type="button"
                  onClick={undoLevelAction}
                  disabled={history.past.length === 0}
                  aria-label="Undo"
                >
                  <UndoIcon />
                  Undo
                </button>
                <button
                  className="nav-icon-action"
                  type="button"
                  onClick={redoLevelAction}
                  disabled={history.future.length === 0}
                  aria-label="Redo"
                >
                  <RedoIcon />
                  Redo
                </button>
              </>
            )}
            <button
              className="secondary-action nav-icon-action"
              type="button"
              onClick={() => void saveActiveLevel()}
              disabled={levelBankSaving}
            >
              <SaveIcon />
              {levelBankSaving ? 'Saving' : 'Save'}
            </button>
            <button className="primary-action" type="button" onClick={openPublishModal} disabled={levelBankSaving}>
              Publish
            </button>
          </div>
        </header>

        <section className="editor-workspace">
          <aside className="editor-tool-panel">
            {editorMode === 'create' ? (
              <>
                <div className="tool-group">
                  <ToolGroupHeading icon={<img src={panIcon} alt="" aria-hidden="true" />}>Move</ToolGroupHeading>
                  <button
                    className={`wide-tool-button ${createMode === 'move' ? 'selected' : ''}`}
                    type="button"
                    onClick={() => selectCreateMode('move')}
                  >
                    Pan and zoom
                  </button>
                  <div className="zoom-button-row">
                    <button type="button" onClick={() => zoomView('out')} aria-label="Zoom out">
                      -
                    </button>
                    <button type="button" onClick={resetView}>
                      Fit
                    </button>
                    <button type="button" onClick={() => zoomView('in')} aria-label="Zoom in">
                      +
                    </button>
                  </div>
                </div>

                <div className="tool-group">
                  <ToolGroupHeading icon={<img src={pencilIcon} alt="" aria-hidden="true" />}>Draw</ToolGroupHeading>
                  <div className="segmented-control">
                    <button
                      className={createMode === 'draw' && drawLineKind === 'collision' ? 'selected' : ''}
                      type="button"
                      onClick={() => {
                        selectDrawKind('collision');
                      }}
                    >
                      Collision
                    </button>
                    <button
                      className={createMode === 'draw' && drawLineKind === 'scenery' ? 'selected' : ''}
                      type="button"
                      onClick={() => {
                        selectDrawKind('scenery');
                      }}
                    >
                      Scenery
                    </button>
                  </div>
                </div>

                <div className="tool-group">
                  <ToolGroupHeading icon={<StyleIcon />}>Style</ToolGroupHeading>
                  <div className="style-grid">
                    {[
                      ['straight', 'Straight'],
                      ['curvy', 'Curvy'],
                      ['sketch', 'Sketch'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={drawStyle === value ? 'selected' : ''}
                        type="button"
                        onClick={() => {
                          selectDrawStyle(value as DrawStyle);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="tool-group">
                  <ToolGroupHeading icon={<img src={eraserIcon} alt="" aria-hidden="true" />}>Erase</ToolGroupHeading>
                  <button
                    className={`wide-tool-button ${createMode === 'erase' ? 'selected' : ''}`}
                    type="button"
                    onClick={() => selectCreateMode('erase')}
                  >
                    Whole line
                  </button>
                </div>

                <div className="tool-group">
                  <ToolGroupHeading icon={<PlaceIcon />}>Place</ToolGroupHeading>
                  <div className="segmented-control">
                    <button
                      className={createMode === 'place-start' ? 'selected' : ''}
                      type="button"
                      onClick={() => selectCreateMode('place-start')}
                    >
                      Start
                    </button>
                    <button
                      className={createMode === 'place-finish' ? 'selected' : ''}
                      type="button"
                      onClick={() => selectCreateMode('place-finish')}
                    >
                      Finish
                    </button>
                  </div>
                </div>

                <div className="tool-group">
                  <ToolGroupHeading icon={<img src={startButtonImage} alt="" aria-hidden="true" />}>Test</ToolGroupHeading>
                  <button className="wide-tool-button test-button" type="button" onClick={enterTestMode}>
                    Test run
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="tool-group">
                  <ToolGroupHeading icon={<img src={startButtonImage} alt="" aria-hidden="true" />}>Test</ToolGroupHeading>
                  <div className="segmented-control">
                    <button type="button" onClick={returnToCreateMode}>
                      Create
                    </button>
                    <button
                      className={testStatus === 'running' ? 'selected' : ''}
                      type="button"
                      onClick={() => {
                        if (testStatus === 'running') {
                          pauseTestRun();
                        } else {
                          playTestRun();
                        }
                      }}
                    >
                      {testStatus === 'running' ? 'Pause' : 'Play'}
                    </button>
                  </div>
                  <button className="wide-tool-button" type="button" onClick={resetTestRun}>
                    Reset run
                  </button>
                  <div className="zoom-button-row">
                    <button type="button" onClick={() => zoomView('out')} aria-label="Zoom out">
                      -
                    </button>
                    <button type="button" onClick={resetView}>
                      Fit
                    </button>
                    <button type="button" onClick={() => zoomView('in')} aria-label="Zoom in">
                      +
                    </button>
                  </div>
                </div>
                <div className={`test-status-card status-${testBanner ?? testStatus}`}>
                  <span>Status</span>
                  <strong>{testBanner ?? testStatus}</strong>
                </div>
              </>
            )}

            <div className="requirements-card">
              <h2>Checklist</h2>
              <span className={data.start ? 'complete' : ''}>Start point</span>
              <span className={data.finish ? 'complete' : ''}>Finish point</span>
              <span className={canPublish ? 'complete' : ''}>Ready to publish</span>
            </div>
          </aside>

          <section className={`editor-map-panel mode-${editorMode}`}>
            <svg
              ref={svgRef}
              className="level-editor-map"
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
              role="application"
              aria-label="Level creation map"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                panStateRef.current = null;
                setDraftPoints([]);
              }}
              onWheel={handleWheel}
            >
              <rect width={LEVEL_WIDTH} height={LEVEL_HEIGHT} />
              <PreviewGrid />
              <g className="editor-grey-lines">
                {data.greyLines.map((line) => (
                  <polyline
                    key={line.id}
                    className={line.id === hoveredLineId ? 'hovered' : ''}
                    points={linePoints(line.points)}
                  />
                ))}
              </g>
              <g className="editor-black-lines">
                {data.blackLines.map((line) => (
                  <polyline
                    key={line.id}
                    className={line.id === hoveredLineId ? 'hovered' : ''}
                    points={linePoints(line.points)}
                  />
                ))}
              </g>
              {activeDraftPoints.length > 1 && (
                <polyline
                  className={drawLineKind === 'collision' ? 'draft-black-line' : 'draft-grey-line'}
                  points={linePoints(activeDraftPoints)}
                />
              )}
              {data.start && (
                <g className="map-marker marker-start" transform={`translate(${data.start.x} ${data.start.y})`}>
                  <circle r="46" />
                  <text y="-62">START</text>
                </g>
              )}
              {data.finish && (
                <g className="map-marker marker-finish" transform={`translate(${data.finish.x} ${data.finish.y})`}>
                  <circle r="46" />
                  <text y="-62">FINISH</text>
                </g>
              )}
              {editorMode === 'test' && testSkier && (
                <TestSkierSprite state={testSkier} />
              )}
            </svg>

            {editorMode === 'test' && testBanner === 'complete' && (
              <div className="level-complete-banner">Level complete!</div>
            )}
            {editorMode === 'test' && testBanner === 'crashed' && (
              <div className="level-complete-banner retry">Reset and try again</div>
            )}
          </section>
        </section>

        {toast && <div className="designer-toast">{toast}</div>}

        {publishModalOpen && (
          <MetadataModal
            title="Publish level"
            submitLabel="Let's publish"
            name={metadataName}
            description={metadataDescription}
            difficulty={metadataDifficulty}
            difficultyRequired
            error={metadataError}
            onNameChange={setMetadataName}
            onDescriptionChange={setMetadataDescription}
            onDifficultyChange={setMetadataDifficulty}
            onCancel={() => setPublishModalOpen(false)}
            onSubmit={publishActiveLevel}
          />
        )}
      </main>
    );
  }

  return (
    <main className="level-designer-shell">
      <section className="level-designer-header">
        <div>
          <p className="level-designer-kicker">Level designer</p>
          <h1>Your levels</h1>
        </div>
        <button className="create-level-button" type="button" onClick={openCreateModal}>
          <span aria-hidden="true">+</span>
          Create a new level
        </button>
      </section>

      <div className={`level-bank-status ${levelBankResponse?.serverAvailable ? 'online' : 'offline'}`}>
        <span>{levelBankLoading ? 'Loading level bank' : levelBankResponse?.serverAvailable ? 'Netlify level bank connected' : 'Static seed fallback'}</span>
        <span>{LEVEL_BANK_SITE_NAME}</span>
      </div>

      <section className="level-grid" aria-label="Your levels">
        {levels.map((level) => {
          const difficulty = level.metadata.difficulty ?? 'unassigned';

          return (
          <article className="level-tile" key={`${level.source}-${level.metadata.levelId}`}>
            <div className="level-image-frame">
              <LevelTileImage level={level} />
            </div>
            <div className="level-tile-body">
              <div>
                <h2>{level.metadata.name}</h2>
                <p>{level.metadata.levelId}</p>
              </div>
              <div className="level-tile-actions">
                <button
                  type="button"
                  title="Edit level"
                  aria-label={`Edit ${level.metadata.name}`}
                  onClick={() => editLevelFromOverview(level)}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  title="Delete level"
                  aria-label={`Delete ${level.metadata.name}`}
                  onClick={() => setDeleteTarget(level)}
                >
                  <BinIcon />
                </button>
              </div>
            </div>
            <div className="level-meta-row">
              <span className={`difficulty-pill difficulty-${difficulty}`}>
                {difficulty}
              </span>
              <span>{level.metadata.owners.join(', ') || DEFAULT_LEVEL_OWNER}</span>
              <span>{level.metadata.status}</span>
              <span>v{level.metadata.version}</span>
            </div>
          </article>
        );
        })}
      </section>

      {createModalOpen && (
        <MetadataModal
          title="Create a new level"
          submitLabel="Let's create!"
          name={metadataName}
          description={metadataDescription}
          difficulty={metadataDifficulty}
          difficultyRequired={false}
          error={metadataError}
          onNameChange={setMetadataName}
          onDescriptionChange={setMetadataDescription}
          onDifficultyChange={setMetadataDifficulty}
          onCancel={() => setCreateModalOpen(false)}
          onSubmit={createLevelFromModal}
        />
      )}

      {deleteTarget && (
        <DeleteLevelModal
          level={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onDelete={confirmDeleteLevel}
        />
      )}
    </main>
  );
}

interface MetadataModalProps {
  title: string;
  submitLabel: string;
  name: string;
  description: string;
  difficulty: MetadataDifficulty;
  difficultyRequired?: boolean;
  error: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDifficultyChange: (value: MetadataDifficulty) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

function TestSkierSprite({ state }: { state: SkierRenderState }) {
  const drawPart = (
    href: string,
    part: { x: number; y: number; angle: number },
    dimensions: { width: number; height: number },
    offset: { x: number; y: number }
  ) => {
    const width = dimensions.width * SKIER_SPRITE_SCALE;
    const height = dimensions.height * SKIER_SPRITE_SCALE;

    return (
      <image
        href={href}
        x={-width / 2 + offset.x}
        y={-height / 2 + offset.y}
        width={width}
        height={height}
        transform={`translate(${part.x} ${part.y}) rotate(${(part.angle * 180) / Math.PI})`}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  };

  return (
    <g className="test-skier-sprite">
      {drawPart(skierSpriteUrls.skis, state.skis, skierSpriteDimensions.skis, SKIER_SPRITE_OFFSETS.skis)}
      {drawPart(skierSpriteUrls.legs, state.lower, skierSpriteDimensions.legs, SKIER_SPRITE_OFFSETS.legs)}
      {drawPart(skierSpriteUrls.torso, state.upper, skierSpriteDimensions.torso, SKIER_SPRITE_OFFSETS.torso)}
      {drawPart(skierSpriteUrls.head, state.head, skierSpriteDimensions.head, SKIER_SPRITE_OFFSETS.head)}
    </g>
  );
}

function DeleteLevelModal({
  level,
  onCancel,
  onDelete,
}: {
  level: DesignerLevel;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="metadata-modal-backdrop" role="presentation">
      <section className="metadata-modal" role="dialog" aria-modal="true" aria-labelledby="delete-level-title">
        <h2 id="delete-level-title">Delete level?</h2>
        <p className="delete-level-copy">
          This will remove the level from the Netlify level bank for this site.
        </p>
        <p className="delete-level-name">{level.metadata.name}</p>
        <div className="metadata-modal-actions">
          <button className="secondary-action" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="danger-action" type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}

function MetadataModal({
  title,
  submitLabel,
  name,
  description,
  difficulty,
  difficultyRequired = true,
  error,
  onNameChange,
  onDescriptionChange,
  onDifficultyChange,
  onCancel,
  onSubmit,
}: MetadataModalProps) {
  return (
    <div className="metadata-modal-backdrop" role="presentation">
      <section className="metadata-modal" role="dialog" aria-modal="true" aria-labelledby="metadata-modal-title">
        <h2 id="metadata-modal-title">{title}</h2>
        <label>
          Level name
          <input
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Misty Ridge"
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="A fast alpine route with a calm scenic middle section."
          />
        </label>
        <label>
          {difficultyRequired ? 'Difficulty' : 'Difficulty (optional)'}
          <select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value as MetadataDifficulty)}>
            {(!difficultyRequired || !difficulty) && (
              <option value="" disabled={difficultyRequired}>
                {difficultyRequired ? 'Choose difficulty' : 'Pick later'}
              </option>
            )}
            {difficultyOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="metadata-error">{error}</p>}
        <div className="metadata-modal-actions">
          <button className="secondary-action" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-action" type="button" onClick={onSubmit}>
            {submitLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
