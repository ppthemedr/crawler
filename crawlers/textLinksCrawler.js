/* TEXT + LINKS CRAWLER
   – prioriteit 1: “contact / over / impressum …”
   – prioriteit 2: menu-links (<nav>)
   – optionele delayMillis  + jitter
   – retries & time-outs
   – stealth-fingerprints om 302-redirect-trucs te vermijden
---------------------------------------------------------------- */
import {
  PlaywrightCrawler,
  Dataset,
  log
} from 'crawlee';

export async function textLinksCrawler(startUrl, runId, options = {}) {
  /********* 0. Datasets *********/
  const itemsStore = await Dataset.open(runId);           // resultaten
  const errorStore = await Dataset.open(`${runId}-errors`); // fouten

  /********* 1. Crawler-instantie *********/
  const crawler = new PlaywrightCrawler({
    requestHandler: ctx => mainHandler(ctx, itemsStore, errorStore, options),

    /* Beleefde limieten + retries */
    maxRequestsPerCrawl:   options.maxRequestsPerCrawl   ?? 8,
    navigationTimeoutSecs: options.navigationTimeoutSecs ?? 30,
    maxRequestRetries:     options.maxRequestRetries     ?? 3,
    maxConcurrency:        2,

    /* Stealth + fingerprint elke nieuwe pagina */
    browserPoolOptions: {
      useFingerprints: true,
      fingerprintOptions: {
        fingerprintGenerator: { devices: ['desktop'] }    // realistisch
      },
      preLaunchHooks: [
        async (_id, launchCtx) => { launchCtx.launchOptions.stealth = true; }
      ],
      postPageCreateHooks: [
        async (_id, page) => {
          await page.addInitScript(
            'Object.defineProperty(navigator,"webdriver",{get:()=>undefined})'
          );
        }
      ]
    },

    /* Log mislukte requests */
    failedRequestHandler: async ({ request, error }) => {
      await errorStore.pushData({ url: request.url, error: error.message });
      log.error(`❌ ${request.url} — ${error.message}`);
    }
  });

  await crawler.run([startUrl]);
}

/* ============================================================= */
/* ================  MAIN PAGE-HANDLER ========================= */
/* ============================================================= */
async function mainHandler(
  { page, request, requestQueue },
  itemsStore,
  errorStore,
  options
) {
  try {
    /* 1. DOM opschonen */
    await page.evaluate(() =>
      document.querySelectorAll('script,style,template,noscript')
        .forEach(el => el.remove())
    );

    /* 2. Tekst & HTML ophalen */
    const html = await page.content();
    const text = await page.evaluate(() => {
      const root = document.querySelector('main,article,#content');
      return (root ?? document.body).innerText.trim();
    });

    /* 3. Alle absolute links + menu-links */
    const allLinks = await page.$$eval('a[href]', els =>
      [...new Set(
        els.map(a => a.href.trim())
           .filter(u => u.startsWith('http'))
      )]
    );
    const navLinks = await page.$$eval('nav a[href]', els => els.map(a => a.href.trim()));

    /* 4. Contact-regex */
    const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const phoneRx = /(\+?\d[\d\s\-]{7,}\d)/g;
    const emails  = [...new Set(text.match(emailRx)  || [])];
    const phones  = [...new Set(text.match(phoneRx) || [])];

    /* 5. Resultaat alleen op eerste poging wegschrijven */
    if (request.retryCount === 0) {
      await itemsStore.pushData({
        url: request.url,
        text,
        links: allLinks,
        emails,
        phones,
        contactFound: emails.length || phones.length
      });
    }

    /* 6. Beleefde delay (jitter) */
    const baseDelay = options.delayMillis ?? 0;
    if (baseDelay) {
      const jitter = baseDelay * (0.7 + 0.6 * Math.random());
      await new Promise(r => setTimeout(r, jitter));
    }

    /* 7. Max depth check */
    const depth     = (request.userData.depth ?? 0);
    const maxDepth  = options.maxDepth ?? 3;
    if (depth >= maxDepth) return;

    /* 8. Prioriteiten bepalen */
    const keywordPri = allLinks.filter(u =>
      /contact|about|over|impressum|legal|kontakt|contato/i.test(u)
    );
    const menuPri = allLinks.filter(u =>
      navLinks.includes(u) && !keywordPri.includes(u)
    );
    const normal = allLinks.filter(u =>
      !keywordPri.includes(u) && !menuPri.includes(u)
    );

    const makeReq = (url) => ({
      url,
      uniqueKey: url,                         // de-duplicatie
      userData: { depth: depth + 1 }
    });

    /* 9. Queue: keywords → menu → rest */
    await requestQueue.addRequests(keywordPri.map(makeReq), { forefront: true });
    await requestQueue.addRequests(menuPri.map(makeReq),    { forefront: true });
    await requestQueue.addRequests(normal.map(makeReq));

  } catch (err) {
    await errorStore.pushData({ url: request.url, error: err.message });
    throw err;                                  // retrigger retry-mechanisme
  }
}
