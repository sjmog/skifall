import {
  LEVEL_BANK_BLOB_KEY,
  LEVEL_BANK_SITE_NAME,
  LEVEL_BANK_STORE_NAME,
  createSeedLevelBank,
  normalizeLevelBankDocument,
  type LevelBankDocument,
  type LevelBankLevel,
  type LevelBankResponse,
} from './level-bank';

const DEFAULT_LEVELS_API_PATH = '/.netlify/functions/levels';

function getLevelsApiUrl(): string {
  return import.meta.env.VITE_LEVELS_API_URL || DEFAULT_LEVELS_API_PATH;
}

function staticSeedResponse(error?: string): LevelBankResponse {
  return {
    document: createSeedLevelBank(),
    source: 'static-seed',
    serverAvailable: false,
    storeName: LEVEL_BANK_STORE_NAME,
    blobKey: LEVEL_BANK_BLOB_KEY,
    siteName: LEVEL_BANK_SITE_NAME,
    error,
  };
}

async function parseLevelBankResponse(response: Response): Promise<LevelBankResponse> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.includes('application/json')) {
    throw new Error(`Level bank request failed with ${response.status}`);
  }

  const payload = await response.json();
  return {
    ...payload,
    document: normalizeLevelBankDocument(payload.document),
  } as LevelBankResponse;
}

export async function loadLevelBank(): Promise<LevelBankResponse> {
  try {
    const response = await fetch(getLevelsApiUrl(), {
      headers: { Accept: 'application/json' },
    });
    return await parseLevelBankResponse(response);
  } catch (error) {
    return staticSeedResponse(error instanceof Error ? error.message : 'Level bank is unavailable.');
  }
}

export async function saveLevelToLevelBank(level: LevelBankLevel): Promise<LevelBankResponse> {
  const response = await fetch(getLevelsApiUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ level }),
  });
  return parseLevelBankResponse(response);
}

export async function replaceLevelBank(document: LevelBankDocument): Promise<LevelBankResponse> {
  const response = await fetch(getLevelsApiUrl(), {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ document }),
  });
  return parseLevelBankResponse(response);
}

export async function deleteLevelFromLevelBank(levelId: string): Promise<LevelBankResponse> {
  const url = new URL(getLevelsApiUrl(), window.location.origin);
  url.searchParams.set('levelId', levelId);

  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return parseLevelBankResponse(response);
}
