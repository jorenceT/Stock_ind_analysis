import express from 'express';

const app = express();
const port = process.env.PORT || 3000;
const upstream = 'https://query1.finance.yahoo.com';
const marketauxUpstream = 'https://api.marketaux.com';
const marketauxApiToken = process.env.MARKETAUX_API_TOKEN;

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
    res.status(response.status).setHeader('content-type', contentType);
    res.send(await response.text());
  } catch (error) {
    res.status(502).json({
      error: 'Proxy request failed',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(port, () => {
  console.log(`Market data proxy listening on port ${port}`);
});
