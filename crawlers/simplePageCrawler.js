// simplePageCrawler.js
import { PlaywrightCrawler, Dataset } from 'crawlee';

export async function simplePageCrawler(startUrl, runId, options = {}) {
  const itemsDs = await Dataset.open(runId);

  const crawler = new PlaywrightCrawler({
    navigationTimeoutSecs: options.navigationTimeoutSecs ?? 30,
    maxRequestRetries:     options.maxRequestRetries     ?? 3,
    // 'ignoreRobotsTxt' is hier volledig verwijderd, omdat het problemen veroorzaakt.
    // Standaard respecteert Crawlee robots.txt.

    requestHandler: async ({ page, request }) => {
      // My comment: clean out scripts/styles to get cleaner text
      await page.evaluate(() =>
        document.querySelectorAll('script,style,template,noscript')
               .forEach(el => el.remove())
      );

      // My comment: extract visible text from the main content area or body
      const textContent = await page.evaluate(() => {
        const root = document.querySelector('main,article,#content');
        return (root ?? document.body).innerText.trim();
      });

      // Haal alle absolute links op de pagina op
      const links = await page.$$eval('a[href]', els =>
        [...new Set(
          els.map(a => a.href.trim())
             .filter(h => h.startsWith('http'))
        )]
      );

      // Sla alleen de URL, tekstinhoud en links op
      await itemsDs.pushData({
        url: request.url,
        textContent,
        links
      });

      // Geen enqueueLinks, want we crawlen maar één pagina
    }
  });

  // Start de crawler met alleen de opgegeven URL
  // De optie 'ignoreRobotsTxt' is ook hier verwijderd.
  await crawler.run([{ url: startUrl }]);
}
