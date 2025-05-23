import { PlaywrightCrawler, Dataset } from 'crawlee';

export async function textLinksCrawler(startUrl, runId, options = {}) {
  // My comment: open separate datasets for items & errors
  const itemsDs = await Dataset.open(runId);
  const errorDs = await Dataset.open(`${runId}-errors`);

  // Haal de maxDepth uit de options, of gebruik 3 als default.
  // Deze variabele gebruiken we ZELF om de diepte te controleren.
  const maxDepth = options.maxDepth ?? 3;

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl:   options.maxRequestsPerCrawl   ?? 5,
    // maxDepth:              options.maxDepth            ?? 3, // <--- DEZE LIJN MOET ABSOLUUT VERWIJDERD WORDEN!
    navigationTimeoutSecs: options.navigationTimeoutSecs ?? 30,
    maxRequestRetries:     options.maxRequestRetries     ?? 3,
    ignoreRobotsTxt:       true,

    failedRequestHandler: async ({ request, error }) => {
      // My comment: log failed requests into error dataset
      await errorDs.pushData({ url: request.url, error: error.message });
      console.error(`❌ ${request.url} — ${error.message}`);
    },

    requestHandler: async ({ page, request, enqueueLinks }) => {
      // My comment: clean out scripts/styles
      await page.evaluate(() =>
        document.querySelectorAll('script,style,template,noscript')
               .forEach(el => el.remove())
      );

      // My comment: extract visible text
      const text = await page.evaluate(() => {
        const root = document.querySelector('main,article,#content');
        return (root ?? document.body).innerText.trim();
      });

      // My comment: all absolute links on the page
      const links = await page.$$eval('a[href]', els =>
        [...new Set(
          els.map(a => a.href.trim())
             .filter(h => h.startsWith('http'))
        )]
      );

      // My comment: social media detection
      const socialLinks = links.filter(u =>
        /(facebook|twitter|instagram|linkedin)\.com/i.test(u)
      );

      // My comment: advanced metadata
      const title = await page.title();
      const metaDescription = await page.$eval(
        'head meta[name="description"]', el => el.content
      ).catch(() => '');
      const canonical = await page.$eval(
        'head link[rel="canonical"]', el => el.href
      ).catch(() => '');
      const h1 = await page.$$eval('h1', els => els.map(e=>e.innerText.trim()));
      const h2 = await page.$$eval('h2', els => els.map(e=>e.innerText.trim()));
      const images = await page.$$eval('img', imgs =>
        imgs.map(i => i.src).filter(src => src)
      );

      // My comment: simple contact detection
      const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
      const phoneRx = /(\+?\d[\d\-\s]{7,}\d)/g;
      const emails = [...new Set(text.match(emailRx)  || [])];
      const phones = [...new Set(text.match(phoneRx) || [])];

      // My comment: push data only on first try
      if (request.retryCount === 0) {
        await itemsDs.pushData({
          url: request.url,
          title,
          metaDescription,
          canonical,
          h1,
          h2,
          images,
          socialLinks,
          text,
          links,
          emails,
          phones
        });
      }

      // My comment: politeness delay
      const delay = options.delayMillis ?? 0;
      if (delay) await new Promise(r => setTimeout(r, delay));

      // My comment: ENQUEUE LINKS ALLEEN ALS DE HUIDIGE DIEPTE KLEINER IS DAN DE MAXIMALE DIEPTE
      // De 'request' object heeft een 'depth' property die de huidige diepte bijhoudt.
      if (request.depth < maxDepth) {
        await enqueueLinks({ strategy: 'same-domain' });
      }
    }
  });

  // Bij het starten van de crawler, geef de initiële diepte mee aan de startUrl.
  // Standaard is de diepte van de eerste request 0.
  await crawler.run([{ url: startUrl, userData: { depth: 0 } }]);
}
