/* EXPRESS API — tekstcrawler + token/basic-auth + dataset-beheer
---------------------------------------------------------------- */
import express              from 'express';
import fs                    from 'fs/promises';
import { Dataset }          from 'crawlee';
import { textLinksCrawler } from './crawlers/textLinksCrawler.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

/* ---------- 1. Auth-gate ------------------------------------ */
const API_TOKEN = process.env.API_TOKEN ?? '';
app.use((req, res, next) => {
  if (!API_TOKEN) return next();                         // auth uit

  /* 1) simple header */
  if (req.headers['x-api-token'] === API_TOKEN) return next();

  /* 2) Basic Auth  (user maakt niet uit, pass = token) */
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Basic ')) {
    const [, b64]  = auth.split(' ');
    const [, pass] = Buffer.from(b64, 'base64').toString().split(':');
    if (pass === API_TOKEN) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Crawler"');
  return res.status(401).json({ error: 'unauthorized' });
});

/* ---------- 2. Statische export van datasets --------------- */
app.use('/datasets', express.static('/apify_storage/datasets'));

/* ---------- 3. Run starten  (alleen text crawler) ---------- */
app.post('/run', async (req, res) => {
  const { crawler_type, startUrl, options = {} } = req.body;
  if (crawler_type !== 'text' || !startUrl) {
    return res.status(400).json({ error: 'crawler_type must be "text" and startUrl required' });
  }

  const runId = `run-${Date.now()}`;
  try {
    await textLinksCrawler(startUrl, runId, options);

    const ds      = await Dataset.open(runId);
    const result  = await ds.getData();           // { items, total }
    const pages   = result.items.map(i => i.url); // overzicht

    res.json({ status: 'ok', datasetId: runId, pages, items: result.items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------- 4. Eén dataset verwijderen --------------------- */
app.delete('/datasets/:id', async (req, res) => {
  try {
    await Dataset.delete(req.params.id);
    res.json({ status: 'deleted', id: req.params.id });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

/* ---------- 5. Alle datasets verwijderen ------------------- */
app.delete('/datasets', async (_req, res) => {
  const base = '/apify_storage/datasets';
  try {
    const entries = await fs.readdir(base);
    const runDirs = entries.filter(d => d.startsWith('run-'));
    for (const id of runDirs) await Dataset.delete(id);
    res.json({ status: 'deleted-all', count: runDirs.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- 6. Lijst van alle datasets --------------------- */
app.get('/datasets', async (_req, res) => {
  const base = '/apify_storage/datasets';
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

app.listen(3000, () => console.log('Crawler-API listening on :3000'));
