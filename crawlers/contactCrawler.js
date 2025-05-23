/* QUICK CONTACT-ONLY CRAWLER
--------------------------------------------------- */
import { PlaywrightCrawler, Dataset } from 'crawlee';

export async function contactCrawler(startUrl, runId) {
  const dataset = await Dataset.open(runId);

  const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const phoneRx = /(\+?\d[\d\-\s]{7,}\d)/g;

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 5,
    async requestHandler({ page, request, enqueueLinks }) {
      const html   = await page.content();
      const emails = [...new Set(html.match(emailRx)  || [])];
      const phones = [...new Set(html.match(phoneRx) || [])];

      await dataset.pushData({
        url: request.url,
        emails,
        phones,
        contactFound: emails.length || phones.length
      });

      await enqueueLinks({ strategy: 'same-domain' });
    }
  });

  await crawler.run([startUrl]);
}
