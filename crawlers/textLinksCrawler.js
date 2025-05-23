/* SCRAPE VISIBLE TEXT + LINKS  (returns contact flags)
--------------------------------------------------- */
import { PlaywrightCrawler, Dataset } from 'crawlee';

export async function textLinksCrawler(startUrl, runId) {
  const dataset = await Dataset.open(runId);

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 5,
    async requestHandler({ page, request, enqueueLinks }) {
      // Remove script/style elements (cleaner text)              // My comment
      await page.evaluate(() => {
        document.querySelectorAll('script,style,template,noscript')
          .forEach(el => el.remove());
      });

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

      // Basic contact detection                                 // My comment
      const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
      const phoneRx = /(\+?\d[\d\-\s]{7,}\d)/g;
      const emails  = [...new Set(text.match(emailRx)  || [])];
      const phones  = [...new Set(text.match(phoneRx) || [])];

      const contactFound = emails.length || phones.length;

      // Heuristic best next links
      const candidateLinks = links
        .filter(l => /contact|about|over|impressum|legal|team/i.test(l))
        .slice(0, 5);

      await dataset.pushData({
        url: request.url,
        text,
        links,
        emails,
        phones,
        contactFound,
        candidateLinks
      });

      await enqueueLinks({ strategy: 'same-domain' });
    }
  });

  await crawler.run([startUrl]);
}
