import { PlaywrightCrawler, Dataset, log } from 'crawlee';

export async function textLinksCrawler(startUrl, runId, options = {}) {
  const itemsDs = await Dataset.open(runId);
  const errorDs = await Dataset.open(`${runId}-errors`);

  const crawler = new PlaywrightCrawler({
    /* ––– basis-instellingen ––– */
    maxRequestsPerCrawl:   options.maxRequestsPerCrawl   ?? 8,
    navigationTimeoutSecs: options.navigationTimeoutSecs ?? 30,
    maxRequestRetries:     options.maxRequestRetries     ?? 3,
    maxConcurrency:        2,

    /* mislukte requests loggen */
    failedRequestHandler: async ({ request, error }) => {
      await errorDs.pushData({ url: request.url, error: error.message });
      log.error(`❌ ${request.url} — ${error.message}`);
    },

    /* hoofd-handler */
    requestHandler: async ({ page, request, requestQueue }) => {
      await page.evaluate(() =>
        document.querySelectorAll('script,style,template,noscript')
              .forEach(el => el.remove())
      );

      const text = await page.evaluate(() => {
        const root = document.querySelector('main,article,#content');
        return (root ?? document.body).innerText.trim();
      });

      const links = await page.$$eval('a[href]', els =>
        [...new Set(els.map(a => a.href.trim()).filter(u => u.startsWith('http')))]
      );
      const navLinks = await page.$$eval('nav a[href]', els => els.map(a => a.href.trim()));

      const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
      const phoneRx = /(\+?\d[\d\s\-]{7,}\d)/g;
      const emails  = [...new Set(text.match(emailRx)  || [])];
      const phones  = [...new Set(text.match(phoneRx) || [])];

      if (request.retryCount === 0) {
        await itemsDs.pushData({
          url: request.url,
          text,
          links,
          emails,
          phones,
          contactFound: emails.length || phones.length
        });
      }

      const baseDelay = options.delayMillis ?? 0;
      if (baseDelay) {
        const ms = baseDelay * (0.7 + 0.6 * Math.random());
        await new Promise(r => setTimeout(r, ms));
      }

      const depth    = (request.userData.depth ?? 0);
      const maxDepth = options.maxDepth ?? 3;
      if (depth >= maxDepth) return;

      const keywordPri = links.filter(u =>
        /contact|about|over|impressum|legal|kontakt|contato/i.test(u)
      );
      const menuPri = links.filter(u =>
        navLinks.includes(u) && !keywordPri.includes(u)
      );
      const normal = links.filter(u =>
        !keywordPri.includes(u) && !menuPri.includes(u)
      );

      const make = (url) => ({
        url,
        uniqueKey: url,
        userData: { depth: depth + 1 }
      });

      await requestQueue.addRequests(keywordPri.map(make), { forefront: true });
      await requestQueue.addRequests(menuPri.map(make),    { forefront: true });
      await requestQueue.addRequests(normal.map(make));
    }
  });

  await crawler.run([startUrl]);
}
