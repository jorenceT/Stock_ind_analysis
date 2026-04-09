import express from 'express';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = process.env.PORT || 3000;
const upstream = 'https://query1.finance.yahoo.com';
const marketauxUpstream = 'https://api.marketaux.com';
const marketauxApiToken = process.env.MARKETAUX_API_TOKEN;
const newsApiKey = process.env.NEWSAPI_KEY;
const cacheDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache');
const cacheFile = path.join(cacheDir, 'market-news-cache.json');
const cacheTtlMs = 8 * 60 * 60 * 1000;
const inMemoryCache = new Map();
let cacheLoaded = false;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

app.options(/.*/, (_req, res) => {
  res.sendStatus(204);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get(/^\/api\/yahoo\/(.*)$/, async (req, res) => {
  try {
    const path = req.params[0] || '';
    const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const targetUrl = `${upstream}/${path}${search}`;

    const response = await fetch(targetUrl, {
      headers: {
        'accept': 'application/json,text/plain,*/*',
        'user-agent': 'Mozilla/5.0'
      }
    });

    const contentType = response.headers.get('content-type') || 'application/json';
    res.status(response.status).setHeader('content-type', contentType);
    res.send(await response.text());
  } catch (error) {
    res.status(502).json({
      error: 'Proxy request failed',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get(/^\/api\/marketaux\/(.*)$/, async (req, res) => {
  try {
    if (!marketauxApiToken) {
      res.status(500).json({
        error: 'MARKETAUX_API_TOKEN is not configured'
      });
      return;
    }

    const path = req.params[0] || '';
    const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const separator = search ? '&' : '?';
    const cacheKey = `marketaux:${path}${search}`;

    const cachedResponse = await getCachedResponse(cacheKey);
    if (cachedResponse) {
      res.status(cachedResponse.status).setHeader('content-type', cachedResponse.contentType);
      res.setHeader('x-cache', 'HIT');
      res.send(cachedResponse.body);
      return;
    }

    const targetUrl = `${marketauxUpstream}/${path}${search}${separator}api_token=${encodeURIComponent(marketauxApiToken)}`;

    const response = await fetch(targetUrl, {
      headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent': 'Mozilla/5.0'
      }
    });

    const contentType = response.headers.get('content-type') || 'application/json';
    const body = await response.text();

    const cacheEntry = {
      status: response.status,
      contentType,
      body,
      cachedAt: Date.now()
    };

    if (response.status >= 500 || isEmptyMarketAuxResponse(body)) {
      const fallback = await fetchNewsApi(req.url);
      if (fallback) {
        await setCachedResponse(cacheKey, {
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(fallback),
          cachedAt: Date.now()
        });
        res.status(200).json(fallback);
        return;
      }
    }

    await setCachedResponse(cacheKey, cacheEntry);
    res.setHeader('x-cache', 'MISS');
    res.status(response.status).setHeader('content-type', contentType);
    res.send(body);
  } catch (error) {
    res.status(502).json({
      error: 'Proxy request failed',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

async function fetchNewsApi(originalUrl) {
  if (!newsApiKey) {
    return null;
  }

  const fallbackUrl = new URL('https://newsapi.org/v2/everything');
  fallbackUrl.searchParams.set('q', 'India stock market OR NSE OR Indian stocks');
  fallbackUrl.searchParams.set('language', 'en');
  fallbackUrl.searchParams.set('sortBy', 'publishedAt');
  fallbackUrl.searchParams.set('pageSize', '10');
  fallbackUrl.searchParams.set('apiKey', newsApiKey);

  const response = await fetch(fallbackUrl.toString(), {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'user-agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  if (!Array.isArray(data.articles)) {
    return null;
  }

  return {
    data: data.articles.map((article) => ({
      title: article.title,
      url: article.url,
      source: article.source?.name ?? 'NewsAPI',
      published_at: article.publishedAt,
      description: article.description,
      symbols: []
    }))
  };
}

async function getCachedResponse(cacheKey) {
  await ensureCacheLoaded();
  const entry = inMemoryCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.cachedAt > cacheTtlMs) {
    inMemoryCache.delete(cacheKey);
    await persistCache();
    return null;
  }

  return entry;
}

async function setCachedResponse(cacheKey, entry) {
  await ensureCacheLoaded();
  inMemoryCache.set(cacheKey, entry);
  await persistCache();
}

async function ensureCacheLoaded() {
  if (cacheLoaded) {
    return;
  }

  cacheLoaded = true;
  try {
    const raw = await readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
      for (const [key, value] of Object.entries(parsed.entries)) {
        if (value && typeof value === 'object' && typeof value.body === 'string') {
          inMemoryCache.set(key, value);
        }
      }
    }
  } catch {
    // Cache is optional. Start clean when the file does not exist or is invalid.
  }
}

async function persistCache() {
  await mkdir(cacheDir, { recursive: true });
  const entries = Object.fromEntries(inMemoryCache.entries());
  await writeFile(cacheFile, JSON.stringify({ entries }, null, 2), 'utf8');
}

function isEmptyMarketAuxResponse(body) {
  if (!body) {
    return true;
  }

  try {
    const parsed = JSON.parse(body);
    if (!parsed) {
      return true;
    }

    if (Array.isArray(parsed.data)) {
      return parsed.data.length === 0;
    }

    if (Array.isArray(parsed.articles)) {
      return parsed.articles.length === 0;
    }

    return Object.keys(parsed).length === 0;
  } catch {
    return false;
  }
}

app.listen(port, () => {
  console.log(`Market data proxy listening on port ${port}`);
});
