/* TEXT + LINKS CRAWLER – stabiel & beleefd
---------------------------------------------------------------- */
import {
  PlaywrightCrawler,
  Dataset,
  log
} from 'crawlee';

export async function textLinksCrawler(startUrl, runId, options = {}) {
  /* datasets */
  const itemsStore  = await Dataset.open(runId);
  const errorStore  = await Dataset.open(`${runId}-errors`);

  /* crawler */
  const crawler = new PlaywrightCrawler({
    requestHandler: async (ctx) => handler(ctx, itemsStore, errorStore, options),
    maxRequestsPerCrawl:   options.maxRequestsPerCrawl   ?? 5,
    navigationTimeoutSecs: options.navigationTimeoutSecs ?? 30,
    maxConcurrency:        2,
    maxRequestRetries:     options.maxRequestRetries     ?? 3
  });

  await crawler.run([startUrl]);
}

/* ---------- HANDLER ---------- */
async function handler(
  { page, request, requestQueue, log },
  itemsStore,
  errorStore,
  options
) {
  try {
    /********* 1. DOM schoonmaken en tekst ophalen *********/
    await page.evaluate(() =>
      document.querySelectorAll('script,style,template,noscript')
        .forEach(el => el.remove())
    );

    const html = await page.content();
    const text = await page.evaluate(() => {
      const root = document.querySelector('main,article,#content');
      return (root ?? document.body).innerText.trim();
    });

    /********* 2. Alle links + menu-links *********/
    const allLinks = await page.$$eval('a[href]', els =>
      [...new Set(
        els.map(a => a.href.trim())
           .filter(u => u.startsWith('http'))
      )]
    );
    const navLinks = await page.$$eval('nav a[href]', els => els.map(a => a.href.trim()));

    /********* 3. E-mail & telefoon zoeken *********/
    const emailRx  = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const phoneRx  = /(\+?\d[\d\s\-]{7,}\d)/g;
    const emails   = [...new Set(text.match(emailRx)  || [])];
    const phones   = [...new Set(text.match(phoneRx) || [])];
    const contactFound = emails.length || phones.length;

    /********* 4. Dataset-item (alleen 1×) *********/
    if (request.retryCount === 0) {
      await itemsStore.pushData({
        url: request.url,
        text,
        links: allLinks,
        emails,
        phones,
        contactFound
      });
    }

    /********* 5. Beleefde delay (jitter) *********/
    const baseDelay = options.delayMillis ?? 0;
    if (baseDelay) {
      const jitter = baseDelay * (0.7 + 0.6 * Math.random());
      await new Promise(r => setTimeout(r, jitter));
    }

    /********* 6. Diepte-check *********/
    const maxDepth = options.maxDepth ?? 3;
    if ((request.userData.depth ?? 0) >= maxDepth) return;

    /********* 7. Prioriteiten bouwen *********/
    const keywordPri = allLinks.filter(u =>
      /contact|about|over|impressum|legal|kontakt|contato/i.test(u)
    );
    const menuPri = allLinks.filter(u =>
      navLinks.includes(u) && !keywordPri.includes(u)
    );
    const normal = allLinks.filter(u =>
      !keywordPri.includes(u) && !menuPri.includes(u)
    );

    /********* 8. Requests in de queue stoppen *********/
    const makeReq = (url) => ({
      url,
      uniqueKey: url,                     // geen duplicaten
      userData: { depth: (request.userData.depth ?? 0) + 1 }
    });

    await requestQueue.addRequests(keywordPri.map(makeReq), { forefront: true });
    await requestQueue.addRequests(menuPri.map(makeReq),    { forefront: true });
    await requestQueue.addRequests(normal.map(makeReq));

  } catch (err) {
    await errorStore.pushData({ url: request.url, error: err.message });
    log.error(`❌ ${request.url} — ${err.message}`);
    throw err;                              // laat Crawlee retry doen
  }
}
