/* TEXT + LINKS CRAWLER
   – prioriteert "contact / over …"  ➜ eerste
   – menu-links ➜ tweede
   – optionele delayMillis  (+ jitter)
   – maxRequestRetries  &  navigationTimeoutSecs
---------------------------------------------------------------- */
import {
  PlaywrightCrawler,
  Dataset,
  createPlaywrightRouter,
  log
} from 'crawlee';

export async function textLinksCrawler(startUrl, runId, options = {}) {
  /* 1. datasets */
  const dataset    = await Dataset.open(runId);
  const errorStore = await Dataset.open(`${runId}-errors`);

  /* 2. Router aanmaken */
  const router = createPlaywrightRouter();

  router.addDefaultHandler(async ({ page, request, enqueueLinks }) => {
    /* 2.1 DOM opruimen */
    await page.evaluate(() =>
      document.querySelectorAll('script,style,template,noscript')
        .forEach(el => el.remove())
    );

    /* 2.2 Tekst & HTML */
    const html = await page.content();
    const text = await page.evaluate(() => {
      const root = document.querySelector('main,article,#content');
      return (root ?? document.body).innerText.trim();
    });

    /* 2.3 Alle links + menu-links */
    const links = await page.$$eval('a[href]', els =>
      [...new Set(
        els.map(a => a.getAttribute('href'))
           .filter(h => h && !h.startsWith('javascript:') && !h.startsWith('#'))
      )]
    );
    const navLinks = await page.$$eval('nav a[href]', els => els.map(a => a.href));

    /* 2.4 Contact-regex */
    const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const phoneRx = /(\+?\d[\d\-\s]{7,}\d)/g;
    const emails  = [...new Set(text.match(emailRx)  || [])];
    const phones  = [...new Set(text.match(phoneRx) || [])];

    const contactFound   = emails.length || phones.length;
    const candidateLinks = links.filter(l =>
      /contact|about|over|impressum|legal|kontakt|contato/i.test(l)
    ).slice(0, 5);

    /* 2.5 Item wegschrijven – alleen op eerste poging */
    if (request.retryCount === 0) {
      await dataset.pushData({
        url: request.url,
        text,
        links,
        emails,
        phones,
        contactFound,
        candidateLinks
      });
    }

    /* 2.6 Delay met jitter (beleefdheid) */
    const baseDelay = options.delayMillis ?? 0;
    if (baseDelay) {
      const jitter = baseDelay * (0.7 + 0.6 * Math.random());
      await new Promise(r => setTimeout(r, jitter));
    }

    /* 2.7 Priolijsten */
    const keywordPri = links.filter(l =>
      /contact|about|over|impressum|legal|kontakt|contato/i.test(l)
    );
    const menuPri = links.filter(l =>
      navLinks.includes(l) && !keywordPri.includes(l)
    );
    const normal = links.filter(l =>
      !keywordPri.includes(l) && !menuPri.includes(l)
    );

    const maxDepth = options.maxDepth ?? 3;

    /* enqueue – volgorde: keywords → menu → rest */
    for (const link of keywordPri)
      await enqueueLinks({ urls:[link], forefront:true,  maxDepth, strategy:'same-domain' });

    for (const link of menuPri)
      await enqueueLinks({ urls:[link], forefront:true,  maxDepth, strategy:'same-domain' });

    for (const link of normal)
      await enqueueLinks({ urls:[link], forefront:false, maxDepth, strategy:'same-domain' });
  });

  /* 3. Crawler-instantie */
  const crawler = new PlaywrightCrawler({
    requestHandler:         router,
    maxRequestsPerCrawl:    options.maxRequestsPerCrawl   ?? 5,
    minConcurrency:         1,
    maxConcurrency:         2,
    navigationTimeoutSecs:  options.navigationTimeoutSecs ?? 30,
    maxRequestRetries:      options.maxRequestRetries     ?? 3,
    failedRequestHandler: async ({ request, error }) => {
      await errorStore.pushData({ url: request.url, error: error.message });
      log.error(`❌ ${request.url} — ${error.message}`);
    }
  });

  /* 4. Start */
  await crawler.run([startUrl]);
}
