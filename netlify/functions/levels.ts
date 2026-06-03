import { getStore } from '@netlify/blobs';
import {
  LEVEL_BANK_BLOB_KEY,
  LEVEL_BANK_SITE_NAME,
  LEVEL_BANK_STORE_NAME,
  createSeedLevelBank,
  deleteLevelFromDocument,
  normalizeLevelBankDocument,
  upsertLevelInDocument,
  type LevelBankDocument,
  type LevelBankLevel,
} from '../../src/lib/level-bank';

const jsonHeaders = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...init?.headers,
    },
  });
}

function getLevelStore() {
  return getStore({
    name: LEVEL_BANK_STORE_NAME,
    consistency: 'strong',
  });
}

async function writeDocument(document: LevelBankDocument): Promise<LevelBankDocument> {
  const normalizedDocument = normalizeLevelBankDocument(document);
  const store = getLevelStore();
  await store.setJSON(LEVEL_BANK_BLOB_KEY, normalizedDocument, {
    metadata: {
      siteName: LEVEL_BANK_SITE_NAME,
      schemaVersion: normalizedDocument.schemaVersion,
      updatedAt: normalizedDocument.updatedAt,
    },
  });

  return normalizedDocument;
}

async function readDocument(): Promise<LevelBankDocument> {
  const store = getLevelStore();
  const storedDocument = await store.get(LEVEL_BANK_BLOB_KEY, {
    consistency: 'strong',
    type: 'json',
  });

  if (storedDocument) {
    return normalizeLevelBankDocument(storedDocument);
  }

  return writeDocument(createSeedLevelBank());
}

async function responseWithDocument(document: LevelBankDocument): Promise<Response> {
  return jsonResponse({
    document,
    source: 'netlify-blobs',
    serverAvailable: true,
    storeName: LEVEL_BANK_STORE_NAME,
    blobKey: LEVEL_BANK_BLOB_KEY,
    siteName: LEVEL_BANK_SITE_NAME,
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  const adminToken = process.env.LEVEL_BANK_ADMIN_TOKEN;
  const isWrite = request.method !== 'GET';
  if (adminToken && isWrite) {
    const token = request.headers.get('x-level-bank-token');
    if (token !== adminToken) {
      return jsonResponse({ error: 'Unauthorized.' }, { status: 401 });
    }
  }

  try {
    if (request.method === 'GET') {
      return responseWithDocument(await readDocument());
    }

    if (request.method === 'PUT') {
      const payload = await request.json() as { document?: LevelBankDocument };
      if (!payload.document) {
        return jsonResponse({ error: 'Missing level bank document.' }, { status: 400 });
      }

      return responseWithDocument(await writeDocument(payload.document));
    }

    if (request.method === 'POST') {
      const payload = await request.json() as { level?: LevelBankLevel };
      if (!payload.level) {
        return jsonResponse({ error: 'Missing level payload.' }, { status: 400 });
      }

      const document = await readDocument();
      return responseWithDocument(await writeDocument(upsertLevelInDocument(document, payload.level)));
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const levelId = url.searchParams.get('levelId');
      if (!levelId) {
        return jsonResponse({ error: 'Missing levelId query parameter.' }, { status: 400 });
      }

      const document = await readDocument();
      return responseWithDocument(await writeDocument(deleteLevelFromDocument(document, levelId)));
    }

    return jsonResponse({ error: 'Method not allowed.' }, { status: 405 });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Level bank request failed.',
      siteName: LEVEL_BANK_SITE_NAME,
      storeName: LEVEL_BANK_STORE_NAME,
      blobKey: LEVEL_BANK_BLOB_KEY,
    }, { status: 500 });
  }
}
