/* EXPRESS API – alleen TEXT-crawler + auth + datasets
--------------------------------------------------- */
import express              from 'express';
import { Dataset }          from 'crawlee';
import { textLinksCrawler } from './crawlers/textLinksCrawler.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

/* ----------  AUTH  ---------- */
const API_TOKEN = process.env.API_TOKEN ?? '';
app.use((req, res, next) => {
  if (!API_TOKEN) return next();                // geen auth ingesteld

  /* 1) X-API-Token header */
  if (req.headers['x-api-token'] === API_TOKEN) return next();

  /* 2) Basic-auth  (user willekeurig, pass = token) */
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Basic ')) {
    const [, b64]  = auth.split(' ');
    const [, pass] = Buffer.from(b64, 'base64').toString().split(':');
    if (pass === API_TOKEN) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Crawler"');
  return res.status(401).json({ error: 'unauthorized' });
});

/* Datasets statisch exposen */
app.use('/datasets', express.static('/apify_storage/datasets'));

/* --------  POST /run  -------- */
app.post('/run', async (req, res) => {
  const { crawler_type, startUrl, options = {} } = req.body;
  if (crawler_type !== 'text' || !startUrl) {
    return res.status(400).json({ error: 'crawler_type must be \"text\" and startUrl required' });
  }

  const runId = `run-${Date.now()}`;
  try {
    await textLinksCrawler(startUrl, runId, options);

    const ds     = await Dataset.open(runId);
    const result = await ds.getData();
    res.json({ status: 'ok', datasetId: runId, items: result.items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* --------  DELETE /datasets/:id  -------- */
app.delete('/datasets/:id', async (req, res) => {
  try {
    await Dataset.delete(req.params.id);
    res.json({ status: 'deleted', id: req.params.id });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.listen(3000, () => console.log('Crawler-API listening on :3000'));
