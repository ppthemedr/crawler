/* EXPRESS ROUTER SERVER
--------------------------------------------------- */
import express from 'express';
import { textLinksCrawler } from './crawlers/textLinksCrawler.js';
import { contactCrawler }   from './crawlers/contactCrawler.js';
import { sitemapCrawler }   from './crawlers/sitemapCrawler.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/run', async (req, res) => {
  const { crawler_type, startUrl } = req.body;
  if (!crawler_type || !startUrl) {
    return res.status(400).json({ error: 'crawler_type and startUrl required' });
  }

  try {
    switch (crawler_type) {
      case 'text':
        await textLinksCrawler(startUrl);
        break;
      case 'contact':
        await contactCrawler(startUrl);
        break;
      case 'sitemap':
        await sitemapCrawler(startUrl);
        break;
      default:
        return res.status(400).json({ error: 'Unknown crawler_type' });
    }
    res.json({ status: 'ok', crawler_type, startUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Crawler-API listening on :3000'));
