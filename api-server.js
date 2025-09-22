/* IMPORTS
--------------------------------------------------- */
import express from 'express';
import fs      from 'fs/promises';
import path    from 'path';
import { Dataset, Configuration } from 'crawlee';
import { simplePageCrawler } from './crawlers/simplePageCrawler.js';

/* INIT APP
--------------------------------------------------- */
const app = express();
app.use(express.json({ limit: '1mb' }));

/* AUTHENTICATION (BEARER TOKEN)
--------------------------------------------------- */
const API_TOKEN = process.env.API_TOKEN ?? '';
app.use((req, res, next) => {
  if (!API_TOKEN) return next(); // no auth if no token set
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${API_TOKEN}`) return next();
  return res.status(401).json({
    error: 'unauthorized',
    details: 'Invalid or missing Bearer token',
    hint: 'Set Authorization: Bearer <API_TOKEN>'
  });
});

/* STORAGE DIR CONFIGURATION
--------------------------------------------------- */
const storageDir = '/app/storage';
const config = new Configuration({ storageDir });

/* SERVE DATASETS AS STATIC FILES
--------------------------------------------------- */
app.use('/datasets/files', express.static(path.join(storageDir, 'datasets')));

/* SIMPLE IN-MEMORY STATUS TRACKER
--------------------------------------------------- */
const runs = {}; 
// { runId: { status: 'running'|'done'|'error', error?:string } }

/* START NEW CRAWL (ASYNC)
--------------------------------------------------- */
app.post('/run', async (req, res) => {
  const { crawler_type, startUrl, options = {} } = req.body;
  if (crawler_type !== 'simple' || !startUrl) {
    return res.status(400).json({
      error: 'bad_request',
      details: 'crawler_type must be "simple" and startUrl is required'
    });
  }

  const runId = `run-${Date.now()}`;
  runs[runId] = { status: 'running' };

  // respond immediately
  res.json({ status: 'running', datasetId: runId });

  // run in background
  simplePageCrawler(startUrl, runId, options, storageDir)
    .then(async () => {
      const ds = await Dataset.open(runId, { config });
      const { items } = await ds.getData();
      runs[runId] = { status: 'done' };
      console.log(`[${runId}] completed with ${items.length} items`);
    })
    .catch(err => {
      console.error(`[${runId}] error:`, err);
      runs[runId] = { status: 'error', error: err.message };
    });
});

/* GET ONE DATASET (WITH ITEMS)
--------------------------------------------------- */
app.get('/datasets/:id', async (req, res) => {
  try {
    const ds = await Dataset.open(req.params.id, { config });
    const { items } = await ds.getData();

    res.json({
      status: 'ok',
      datasetId: req.params.id,
      itemsCount: items.length,
      items
    });
  } catch (e) {
    res.status(404).json({
      error: 'not_found',
      details: `Dataset ${req.params.id} could not be opened`,
      hint: 'Check if the run has completed and storageDir is correct'
    });
  }
});

/* GET STATUS OF ONE RUN
--------------------------------------------------- */
app.get('/datasets/:id/status', (req, res) => {
  const runId = req.params.id;
  if (!runs[runId]) {
    return res.status(404).json({
      error: 'not_found',
      details: `No run found with id ${runId}`
    });
  }
  res.json({ datasetId: runId, ...runs[runId] });
});

/* LIST ALL RUNS
--------------------------------------------------- */
app.get('/datasets', async (_req, res) => {
  const base = path.join(storageDir, 'datasets');
  try {
    const entries = await fs.readdir(base, { withFileTypes: true });
    const foundRuns = entries
      .filter(d => d.isDirectory() && d.name.startsWith('run-'))
      .map(d => d.name);
    res.json({ runs: foundRuns, count: foundRuns.length });
  } catch (e) {
    res.status(500).json({
      error: 'internal_error',
      details: e.message,
      hint: 'Check storageDir permissions and disk availability'
    });
  }
});

/* DELETE ONE RUN
--------------------------------------------------- */
app.delete('/datasets/:id', async (req, res) => {
  const dirPath = path.join(storageDir, 'datasets', req.params.id);
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    delete runs[req.params.id];
    res.json({ status: 'deleted', id: req.params.id });
  } catch (e) {
    res.status(500).json({
      error: 'delete_failed',
      details: e.message,
      hint: `Check if dataset ${req.params.id} exists and permissions`
    });
  }
});

/* DELETE ALL RUNS
--------------------------------------------------- */
app.delete('/datasets', async (_req, res) => {
  const base = path.join(storageDir, 'datasets');
  try {
    const entries = await fs.readdir(base);
    const runDirs = entries.filter(d => d.startsWith('run-'));
    for (const id of runDirs) {
      await fs.rm(path.join(base, id), { recursive: true, force: true });
      delete runs[id];
    }
    res.json({ status: 'deleted-all', count: runDirs.length });
  } catch (e) {
    res.status(500).json({
      error: 'delete_all_failed',
      details: e.message
    });
  }
});

/* START SERVER
--------------------------------------------------- */
app.listen(3000, () => console.log('Crawler-API listening on :3000'));
