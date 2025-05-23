/* TEXT + LINKS CRAWLER
   – prioriteert “contact / over / impressum …” (keywords)
   – menu-links krijgen tweede prioriteit
   – optionele delayMillis met jitter
   – retry & timeout, zonder dubbele items
--------------------------------------------------------------- */
import { PlaywrightCrawler, Dataset, log } from 'crawlee';

export async function textLinksCrawler(startUrl, runId, options = {}) {
  /* 1. open datasets */
  const dataset     = await Dataset.open(runId);
  const errorStore  = await Dataset.open(`${runId}-errors`);

  /* 2. beleefde crawler-config + retry & timeout */
  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl:   options.maxRequestsPerCrawl   ?? 5,
    minConcurrency:        1,
    maxConcurrency:        2,
    navigationTimeoutSecs: options.navigationTimeoutSecs ?? 30,
    retryAttempts:         options.retryAttempts         ?? 3
  });

  /* 3. mislukte requests loggen */
  crawler.router.setFailedRequestHandler(async ({ request, error }) => {
    await errorStore.pushData({ url: request.url, error: error.message });
    log.error(`❌  ${request.url} — ${error.message}`);
  });

  /* 4. hoofd-handler  */
  crawler.router.addDefaultHandler(async ({ page, request, enqueueLinks }) => {
    /* DOM opschonen */
    await page.evaluate(() =>
      document.querySelectorAll('script,style,template,noscript')
        .forEach(el => el.remove())
    );

    const html = await page.content();
    const text = await page.evaluate(() => {
      const root = document.querySelector('main,article,#content');
      return (root ?? document.body).innerText.trim();
    });

    /* links ophalen */
    const links = await page.$$eval('a[href]', as =>
      [...new Set(
        as.map(a => a.getAttribute('href'))
          .filter(h => h && !h.startsWith('javascript:') && !h.startsWith('#'))
      )]
    );

    /* menu-links apart vangen */
    const navLinks = await page.$$eval('nav a[href]', els => els.map(a => a.href));

    /* contact-regex */
    const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const phoneRx = /(\+?\d[\d\-\s]{7,}\d)/g;
    const emails  = [...new Set(text.match(emailRx)  || [])];
    const phones  = [...new Set(text.match(phoneRx) || [])];

    const contactFound   = emails.length || phones.length;
    const candidateLinks = links.filter(l =>
      /contact|about|over|impressum|legal|kontakt|contato/i.test(l)
    ).slice(0, 5);

    /* schrijf item slechts één keer (eerste poging) */
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

    /* optionele jitter-delay */
    const baseDelay = options.delayMillis ?? 0;
    if (baseDelay) {
      const jitter = baseDelay * (0.7 + 0.6 * Math.random());
      await new Promise(r => setTimeout(r, jitter));
    }

    /* ---- prioriteits-queue opbouwen ---- */
    const keywordPri = links.filter(l =>
      /contact|about|over|impressum|legal|kontakt|contato/i.test(l)
    );
    const menuPri    = links.filter(l =>
      navLinks.includes(l) && !keywordPri.includes(l)
    );
    const normal     = links.filter(l =>
      !keywordPri.includes(l) && !menuPri.includes(l)
    );

    const maxDepth = options.maxDepth ?? 3;

    /* enqueue: eerst keywords, dan menu, dan de rest */
    for (const link of keywordPri) await enqueueLinks({ urls:[link], forefront:true,  strategy:'same-domain', maxDepth });
    for (const link of menuPri)    await enqueueLinks({ urls:[link], forefront:true,  strategy:'same-domain', maxDepth });
    for (const link of normal)     await enqueueLinks({ urls:[link], forefront:false, strategy:'same-domain', maxDepth });
  });

  /* 5. start run */
  await crawler.run([startUrl]);
}
