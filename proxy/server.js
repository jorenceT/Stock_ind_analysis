import express from 'express';

const app = express();
const port = process.env.PORT || 3000;
const upstream = 'https://query1.finance.yahoo.com';
const marketauxUpstream = 'https://api.marketaux.com';
const marketauxApiToken = process.env.MARKETAUX_API_TOKEN;
const newsApiKey = process.env.NEWSAPI_KEY;

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
    const targetUrl = `${marketauxUpstream}/${path}${search}${separator}api_token=${encodeURIComponent(marketauxApiToken)}`;

    const response = await fetch(targetUrl, {
      headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent': 'Mozilla/5.0'
      }
    });

    const contentType = response.headers.get('content-type') || 'application/json';
    const body = await response.text();

    if (response.status >= 500 || isEmptyMarketAuxResponse(body)) {
      const fallback = await fetchNewsApi(req.url);
      if (fallback) {
        res.status(200).json(fallback);
        return;
      }
    }

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
