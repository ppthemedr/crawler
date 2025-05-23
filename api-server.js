/* EXPRESS API: ROUTES /run  +  static /datasets
--------------------------------------------------- */
import express from 'express';
import { Dataset }          from 'crawlee';
import { textLinksCrawler } from './crawlers/textLinksCrawler.js';
import { contactCrawler }   from './crawlers/contactCrawler.js';
import { sitemapCrawler }   from './crawlers/sitemapCrawler.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

/* expose datasets for quick manual access
--------------------------------------------------- */
app.use('/datasets', express.static('/apify_storage/datasets'));

/* POST /run
   body: { crawler_type: 'text'|'contact'|'sitemap', startUrl: 'https://…' }
--------------------------------------------------- */
app.post('/run', async (req, res) => {
  const { crawler_type, startUrl } = req.body;
  if (!crawler_type || !startUrl) {
    return res.status(400).json({ error: 'crawler_type and startUrl required' });
  }

  const runId = `run-${Date.now()}`;            // My comment: unique dataset ID
  try {
    switch (crawler_type) {
      case 'text':
        await textLinksCrawler(startUrl, runId);
        break;
      case 'contact':
        await contactCrawler(startUrl, runId);
        break;
      case 'sitemap':
        await sitemapCrawler(startUrl, runId);
        break;
      default:
        return res.status(400).json({ error: 'Unknown crawler_type' });
    }

    const ds     = await Dataset.open(runId);
    const result = await ds.getData();          // My comment: { items, total }
    res.json({
      status: 'ok',
      datasetId: runId,
      items: result.items
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Crawler-API listening on :3000'));
