/* EXPRESS API: ROUTES /run, /datasets  +  auth-gate
--------------------------------------------------- */
import express                 from 'express';
import { Dataset }             from 'crawlee';
import { textLinksCrawler }    from './crawlers/textLinksCrawler.js';
import { contactCrawler }      from './crawlers/contactCrawler.js';
import { sitemapCrawler }      from './crawlers/sitemapCrawler.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

/* --------  AUTH  -------------------------------- */
const API_TOKEN = process.env.API_TOKEN ?? '';
app.use((req, res, next) => {
  if (!API_TOKEN) return next();                      // auth uit

  // 1) X-API-Token header
  if (req.headers['x-api-token'] === API_TOKEN) return next();

  // 2) Basic-auth (user willekeurig, wachtwoord = token)
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Basic ')) {
    const [, b64]  = auth.split(' ');
    const [, pass] = Buffer.from(b64, 'base64').toString().split(':');
    if (pass === API_TOKEN) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Crawler"');
  return res.status(401).json({ error: 'unauthorized' });
});

/* --------  statische datasets-map  --------------- */
app.use('/datasets', express.static('/apify_storage/datasets'));

/* --------  /run  --------------------------------- */
app.post('/run', async (req, res) => {
  const { crawler_type, startUrl, options = {} } = req.body;
  if (!crawler_type || !startUrl) {
    return res.status(400).json({ error: 'crawler_type and startUrl required' });
  }

  const runId = `run-${Date.now()}`;
  try {
    switch (crawler_type) {
      case 'text':
        await textLinksCrawler(startUrl, runId, options);
        break;
      case 'contact':
        await contactCrawler(startUrl, runId, options);
        break;
      case 'sitemap':
        await sitemapCrawler(startUrl, runId, options);
        break;
      default:
        return res.status(400).json({ error: 'Unknown crawler_type' });
    }

    const ds     = await Dataset.open(runId);
    const result = await ds.getData();
    res.json({ status: 'ok', datasetId: runId, items: result.items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* --------  /datasets/:id  (Delete)  --------------- */
app.delete('/datasets/:id', async (req, res) => {
  try {
    await Dataset.delete(req.params.id);
    res.json({ status: 'deleted', id: req.params.id });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.listen(3000, () => console.log('Crawler-API listening on :3000'));
