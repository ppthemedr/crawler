import express from 'express';
import fs      from 'fs/promises';
import { Dataset } from 'crawlee';
// Importeer de nieuwe, simpele crawler met het correcte pad
import { simplePageCrawler } from './crawlers/simplePageCrawler.js'; // <--- DEZE LIJN IS AANGEPAST

const app = express();
app.use(express.json({ limit: '1mb' }));

// My comment: simple X-API-Token or Basic Auth
const API_TOKEN = process.env.API_TOKEN ?? '';
app.use((req, res, next) => {
  if (!API_TOKEN) return next();
  if (req.headers['x-api-token'] === API_TOKEN) return next();
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Basic ')) {
    const [, b64] = auth.split(' ');
    const pass = Buffer.from(b64, 'base64').toString().split(':')[1];
    if (pass === API_TOKEN) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Crawler"');
  return res.status(401).json({ error: 'unauthorized' });
});

// My comment: expose static datasets
app.use('/datasets', express.static('/app/storage/datasets'));

// My comment: start new crawl
app.post('/run', async (req, res) => {
  const { crawler_type, startUrl, options = {} } = req.body;
  // Controleer op het nieuwe type "simple"
  if (crawler_type !== 'simple' || !startUrl) {
    return res.status(400).json({
      error: 'crawler_type must be "simple" and startUrl required'
    });
  }
  const runId = `run-${Date.now()}`;
  try {
    // Roep de nieuwe, simpele crawler aan
    await simplePageCrawler(startUrl, runId, options);
    const ds     = await Dataset.open(runId);
    const { items } = await ds.getData();
    const pages = items.map(i => i.url);
    res.json({ status: 'ok', datasetId: runId, pages, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// My comment: list all runs
app.get('/datasets', async (_req, res) => {
  const base = '/app/storage/datasets';
  try {
    const entries = await fs.readdir(base, { withFileTypes: true });
    const runs = entries
      .filter(d => d.isDirectory() && d.name.startsWith('run-'))
      .map(d => d.name);
    res.json({ runs, count: runs.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// My comment: delete one run
app.delete('/datasets/:id', async (req, res) => {
  try {
    await Dataset.delete(req.params.id);
    res.json({ status: 'deleted', id: req.params.id });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// My comment: delete all runs
app.delete('/datasets', async (_req, res) => {
  const base = '/app/storage/datasets';
  try {
    const entries = await fs.readdir(base);
    const runDirs = entries.filter(d => d.startsWith('run-'));
    for (const id of runDirs) {
      await Dataset.delete(id);
    }
    res.json({ status: 'deleted-all', count: runDirs.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log('Crawler-API listening on :3000'));
