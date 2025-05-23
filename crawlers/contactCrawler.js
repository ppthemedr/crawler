/* CONTACT-INFO CRAWLER
--------------------------------------------------- */
import { Dataset } from 'crawlee';
import { PlaywrightCrawler } from 'crawlee';

export async function contactCrawler(startUrl) {
  const emailRegex  = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const phoneRegex  = /(\+?\d[\d\-\s]{7,}\d)/g;

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 5,
    async requestHandler({ page, request, enqueueLinks, pushData }) {
      const html = await page.content();

      const emails = [...new Set(html.match(emailRegex)  || [])];
      const phones = [...new Set(html.match(phoneRegex) || [])];

      await pushData({ url: request.url, emails, phones });
      await enqueueLinks({ strategy: 'same-domain' });
    }
  });

  await crawler.run([startUrl]);
}
