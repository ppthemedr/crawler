import express from 'express';
import fs      from 'fs/promises';
import path    from 'path';
import { Dataset } from 'crawlee';
import { simplePageCrawler } from './crawlers/simplePageCrawler.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

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

app.use('/datasets', express.static(process.env.CRAWLEE_STORAGE_DIR + '/datasets'));

app.post('/run', async (req, res) => {
  const { crawler_type, startUrl, options = {} } = req.body;
  if (crawler_type !== 'simple' || !startUrl) {
    return res.status(400).json({
      error: 'crawler_type must be "simple" and startUrl required'
    });
  }
  const runId = `run-${Date.now()}`;
  try {
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

app.get('/datasets', async (_req, res) => {
  const base = process.env.CRAWLEE_STORAGE_DIR + '/datasets';
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

app.delete('/datasets/:id', async (req, res) => {
  const base = process.env.CRAWLEE_STORAGE_DIR + '/datasets';
  const dirPath = path.join(base, req.params.id);

  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    res.json({ status: 'deleted', id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/datasets', async (_req, res) => {
  const base = process.env.CRAWLEE_STORAGE_DIR + '/datasets';
  try {
    const entries = await fs.readdir(base);
    const runDirs = entries.filter(d => d.startsWith('run-'));
    for (const id of runDirs) {
      await fs.rm(path.join(base, id), { recursive: true, force: true });
    }
    res.json({ status: 'deleted-all', count: runDirs.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log('Crawler-API listening on :3000'));
