/* TEXT + LINKS CRAWLER – met prioriteit voor “contact” / “over”
---------------------------------------------------------------- */
import { PlaywrightCrawler, Dataset } from 'crawlee';

export async function textLinksCrawler(startUrl, runId, options = {}) {
  const dataset = await Dataset.open(runId);

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: options.maxRequestsPerCrawl ?? 5
  });

  crawler.router.addDefaultHandler(async ({ page, request, enqueueLinks }) => {
    /* scripts/styles strippen */
    await page.evaluate(() =>
      document.querySelectorAll('script,style,template,noscript')
        .forEach(el => el.remove())
    );

    const text = await page.evaluate(() => {
      const root = document.querySelector('main,article,#content');
      return (root ?? document.body).innerText.trim();
    });

    const links = await page.$$eval('a[href]', as =>
      [...new Set(
        as.map(a => a.getAttribute('href'))
          .filter(h => h && !h.startsWith('javascript:') && !h.startsWith('#'))
      )]
    );

    /* contact-detectie */
    const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const phoneRx = /(\+?\d[\d\-\s]{7,}\d)/g;
    const emails  = [...new Set(text.match(emailRx)  || [])];
    const phones  = [...new Set(text.match(phoneRx) || [])];

    const contactFound   = emails.length || phones.length;
    const candidateLinks = links.filter(l =>
      /contact|about|over|impressum|legal|team/i.test(l)
    ).slice(0, 5);

    await dataset.pushData({
      url: request.url,
      text,
      links,
      emails,
      phones,
      contactFound,
      candidateLinks
    });

    /* -------  PRIORITEIT bij “contact” / “over”  ------- */
    const priority = links.filter(l => /contact|over/i.test(l));
    const normal   = links.filter(l => !/contact|over/i.test(l));

    /* eerst prioriteitslinks (voorfront = true) */
    for (const link of priority) {
      await enqueueLinks({ urls: [link], forefront: true, strategy: 'same-domain' });
    }

    /* daarna overige links, normale volgorde */
    for (const link of normal) {
      await enqueueLinks({ urls: [link], strategy: 'same-domain' });
    }
  });

  await crawler.run([startUrl]);
}
