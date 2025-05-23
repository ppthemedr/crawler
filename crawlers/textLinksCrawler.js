/* TEXT + LINKS CRAWLER
--------------------------------------------------- */
import { PlaywrightCrawler } from 'crawlee';
import { Dataset } from 'crawlee';

export async function textLinksCrawler(startUrl) {
  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 5,
    async requestHandler({ page, request, enqueueLinks, pushData }) {
      // Remove script/style/noscript before grabbing visible text
      await page.evaluate(() => {
        document.querySelectorAll('script, style, noscript, template')
          .forEach(el => el.remove());
      });

      const text = await page.evaluate(() => {
        const main = document.querySelector('main, article, #content');
        return (main ?? document.body).innerText.trim();
      });

      const links = await page.$$eval('a[href]', as =>
        [...new Set(
          as.map(a => a.getAttribute('href'))
            .filter(href =>
              href &&
              !href.startsWith('javascript:') &&
              !href.startsWith('#')
            )
        )]
      );

      await pushData({ url: request.url, text, links });
      await enqueueLinks({ strategy: 'same-domain' });
    }
  });

  await crawler.run([startUrl]);
}
