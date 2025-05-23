/* EXPRESS API – alleen TEXT-crawler + auth + datasets
--------------------------------------------------- */
import express              from 'express';
import fs                   from 'fs/promises';
import path                 from 'path';
import { Dataset }          from 'crawlee';
import { textLinksCrawler } from './crawlers/textLinksCrawler.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

/* ----------  AUTH  ---------- */
const API_TOKEN = process.env.API_TOKEN ?? '';
app.use((req, res, next) => {
  if (!API_TOKEN) return next();                           // auth uit

  /* 1) X-API-Token header */
  if (req.headers['x-api-token'] === API_TOKEN) return next();

  /* 2) Basic Auth (user willekeurig, pass = token) */
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Basic ')) {
    const [, b64]  = auth.split(' ');
    const [, pass] = Buffer.from(b64, 'base64').toString().split(':');
    if (pass === API_TOKEN) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Crawler"');
  return res.status(401).json({ error: 'unauthorized' });
});

/* ----------  static datasets  ---------- */
app.use('/datasets', express.static('/apify_storage/datasets'));

/* --------  POST /run  (alleen text-crawler)  -------- */
app.post('/run', async (req, res) => {
  const { crawler_type, startUrl, options = {} } = req.body;
  if (crawler_type !== 'text' || !startUrl) {
    return res.status(400).json({ error: 'crawler_type must be "text" and startUrl required' });
  }

  const runId = `run-${Date.now()}`;
  try {
    await textLinksCrawler(startUrl, runId, options);

    const ds     = await Dataset.open(runId);
    const result = await ds.getData();                // { items, total }
    const pages  = result.items.map(i => i.url);      // overzicht bovenin 🎯

    res.json({
      status:    'ok',
      datasetId: runId,
      pages,                             // <-- nieuw
      items:     result.items
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* --------  DELETE /datasets/:id  (één run)  -------- */
app.delete('/datasets/:id', async (req, res) => {
  try {
    await Dataset.delete(req.params.id);
    res.json({ status: 'deleted', id: req.params.id });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

/* --------  DELETE /datasets   (alle runs)  -------- */
app.delete('/datasets', async (req, res) => {
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

app.listen(3000, () => console.log('Crawler-API listening on :3000'));
