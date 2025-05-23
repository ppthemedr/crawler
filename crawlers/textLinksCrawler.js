/* TEXT + LINKS CRAWLER
   – prioriteert “contact / over / impressum …”
   – bevat optionele delayMillis voor beleefde crawling
--------------------------------------------------------------- */
import { PlaywrightCrawler, Dataset } from 'crawlee';

export async function textLinksCrawler(startUrl, runId, options = {}) {
  /* open aparte dataset-map voor deze run */
  const dataset = await Dataset.open(runId);

  /* crawler-instantie (robots.txt wordt standaard genegeerd) */
  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: options.maxRequestsPerCrawl ?? 5,
    minConcurrency: 1,
    maxConcurrency: 2
  });

  /* één universele handler */
  crawler.router.addDefaultHandler(async ({ page, request, enqueueLinks }) => {
    /* ------- 1. DOM opruimen & tekst pakken -------- */
    await page.evaluate(() =>
      document.querySelectorAll('script,style,template,noscript')
        .forEach(el => el.remove())
    );

    const html = await page.content();
    const text = await page.evaluate(() => {
      const root = document.querySelector('main,article,#content');
      return (root ?? document.body).innerText.trim();
    });

    /* ------- 2. alle unieke links verzamelen -------- */
    const links = await page.$$eval('a[href]', as =>
      [...new Set(
        as.map(a => a.getAttribute('href'))
          .filter(h => h && !h.startsWith('javascript:') && !h.startsWith('#'))
      )]
    );

    /* ------- 3. eenvoudige contact-regex  -------- */
    const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const phoneRx = /(\+?\d[\d\-\s]{7,}\d)/g;
    const emails  = [...new Set(text.match(emailRx)  || [])];
    const phones  = [...new Set(text.match(phoneRx) || [])];

    const contactFound   = emails.length || phones.length;
    const candidateLinks = links.filter(l =>
      /contact|about|over|impressum|legal|kontakt|contato/i.test(l)
    ).slice(0, 5);

    /* ------- 4. data wegschrijven -------- */
    await dataset.pushData({
      url: request.url,
      text,
      links,
      emails,
      phones,
      contactFound,
      candidateLinks
    });

    /* ------- 5. beleefde delay (optioneel) -------- */
    const delay = options.delayMillis ?? 0;
    if (delay) await new Promise(r => setTimeout(r, delay));

    /* ------- 6. links enqueuen met prioriteit -------- */
    const priority = links.filter(l =>
      /contact|over|impressum|legal|kontakt|contato/i.test(l)
    );
    const normal   = links.filter(l => !priority.includes(l));

    /* eerst belangrijke links – forefront: true */
    for (const link of priority) {
      await enqueueLinks({
        urls: [link],
        forefront: true,
        strategy:  'same-domain',
        maxDepth:  options.maxDepth ?? 3
      });
    }

    /* daarna de rest */
    for (const link of normal) {
      await enqueueLinks({
        urls: [link],
        strategy: 'same-domain',
        maxDepth: options.maxDepth ?? 3
      });
    }
  });

  /* ------- 7. run starten -------- */
  await crawler.run([startUrl]);
}
