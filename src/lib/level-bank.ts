import {
  DEFAULT_LEVEL_OWNER,
  PREGENERATED_LEVELS,
  getDefaultLevelImage,
  getLevelData,
  getLevelMetadata,
  type LevelData,
  type LevelFeature,
  type LevelMetadata,
  type Point,
} from './pregenerated-levels';

export const LEVEL_BANK_SITE_NAME = 'ski-fall';
export const LEVEL_BANK_STORE_NAME = 'levels';
export const LEVEL_BANK_BLOB_KEY = 'level-bank';
export const LEVEL_BANK_SCHEMA_VERSION = 1;

export type LevelBankLevelData = {
  start: Point | null;
  finish: Point | null;
  blackLines: LevelFeature[];
  greyLines: LevelFeature[];
};

export type LevelBankLevel = {
  metadata: LevelMetadata;
  data: LevelBankLevelData;
};

export type LevelBankDocument = {
  schemaVersion: typeof LEVEL_BANK_SCHEMA_VERSION;
  siteName: typeof LEVEL_BANK_SITE_NAME;
  updatedAt: string;
  levels: LevelBankLevel[];
};

export type LevelBankSource = 'netlify-blobs' | 'static-seed';

export type LevelBankResponse = {
  document: LevelBankDocument;
  source: LevelBankSource;
  serverAvailable: boolean;
  storeName: typeof LEVEL_BANK_STORE_NAME;
  blobKey: typeof LEVEL_BANK_BLOB_KEY;
  siteName: typeof LEVEL_BANK_SITE_NAME;
  error?: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function clonePoint(point: Point | null): Point | null {
  return point ? { ...point } : null;
}

export function cloneLevelFeature(feature: LevelFeature): LevelFeature {
  return {
    ...feature,
    points: feature.points.map((point) => ({ ...point })),
  };
}

export function cloneLevelBankData(data: LevelBankLevelData): LevelBankLevelData {
  return {
    start: clonePoint(data.start),
    finish: clonePoint(data.finish),
    blackLines: data.blackLines.map(cloneLevelFeature),
    greyLines: data.greyLines.map(cloneLevelFeature),
  };
}

export function cloneLevelBankLevel(level: LevelBankLevel): LevelBankLevel {
  return {
    metadata: {
      ...level.metadata,
      image: { ...level.metadata.image },
      owners: [...level.metadata.owners],
      tags: [...level.metadata.tags],
    },
    data: cloneLevelBankData(level.data),
  };
}

export function toLevelBankData(data: LevelData): LevelBankLevelData {
  return {
    start: { ...data.start },
    finish: { ...data.finish },
    blackLines: data.blackLines.map(cloneLevelFeature),
    greyLines: data.greyLines.map(cloneLevelFeature),
  };
}

export function createSeedLevelBank(): LevelBankDocument {
  return {
    schemaVersion: LEVEL_BANK_SCHEMA_VERSION,
    siteName: LEVEL_BANK_SITE_NAME,
    updatedAt: today(),
    levels: PREGENERATED_LEVELS.map((template) => ({
      metadata: getLevelMetadata(template),
      data: toLevelBankData(getLevelData(template)),
    })),
  };
}

export function normalizeLevelBankLevel(level: LevelBankLevel): LevelBankLevel {
  return {
    metadata: {
      ...level.metadata,
      owners: [DEFAULT_LEVEL_OWNER],
      tags: level.metadata.tags ?? [],
      status: level.metadata.status ?? 'unfinished',
      image: level.metadata.image ?? getDefaultLevelImage(level.metadata.levelId, level.metadata.name),
      updatedAt: level.metadata.updatedAt ?? today(),
      createdAt: level.metadata.createdAt ?? today(),
      version: level.metadata.version ?? 1,
    },
    data: {
      start: clonePoint(level.data.start ?? null),
      finish: clonePoint(level.data.finish ?? null),
      blackLines: (level.data.blackLines ?? []).map(cloneLevelFeature),
      greyLines: (level.data.greyLines ?? []).map(cloneLevelFeature),
    },
  };
}

export function normalizeLevelBankDocument(value: unknown): LevelBankDocument {
  const fallback = createSeedLevelBank();
  if (!value || typeof value !== 'object') return fallback;

  const record = value as Partial<LevelBankDocument>;
  const levels = Array.isArray(record.levels)
    ? record.levels.map((level) => normalizeLevelBankLevel(level))
    : fallback.levels;

  return {
    schemaVersion: LEVEL_BANK_SCHEMA_VERSION,
    siteName: LEVEL_BANK_SITE_NAME,
    updatedAt: record.updatedAt ?? today(),
    levels,
  };
}

export function upsertLevelInDocument(
  document: LevelBankDocument,
  level: LevelBankLevel
): LevelBankDocument {
  const normalizedLevel = normalizeLevelBankLevel(level);
  return {
    ...document,
    updatedAt: today(),
    levels: [
      normalizedLevel,
      ...document.levels.filter((item) => item.metadata.levelId !== normalizedLevel.metadata.levelId),
    ],
  };
}

export function deleteLevelFromDocument(
  document: LevelBankDocument,
  levelId: string
): LevelBankDocument {
  return {
    ...document,
    updatedAt: today(),
    levels: document.levels.filter((level) => level.metadata.levelId !== levelId),
  };
}
