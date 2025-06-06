// simplePageCrawler.js
import { PlaywrightCrawler, Dataset } from 'crawlee';

export async function simplePageCrawler(startUrl, runId, options = {}) {
  const itemsDs = await Dataset.open(runId);

  const crawler = new PlaywrightCrawler({
    navigationTimeoutSecs: options.navigationTimeoutSecs ?? 30,
    maxRequestRetries:     options.maxRequestRetries     ?? 3,
    ignoreRobotsTxt:       true,

    // Geen failedRequestHandler voor eenvoud, fouten worden gelogd door Crawlee zelf
    // en de run zal falen als de startUrl niet bereikbaar is.

    requestHandler: async ({ page, request }) => {
      // Haal de volledige HTML-inhoud van de pagina op
      const htmlContent = await page.content();

      // Haal alle absolute links op de pagina op
      const links = await page.$$eval('a[href]', els =>
        [...new Set(
          els.map(a => a.href.trim())
             .filter(h => h.startsWith('http'))
        )]
      );

      // Sla alleen de URL, HTML-inhoud en links op
      await itemsDs.pushData({
        url: request.url,
        htmlContent,
        links
      });

      // Geen enqueueLinks, want we crawlen maar één pagina
    }
  });

  // Start de crawler met alleen de opgegeven URL
  await crawler.run([{ url: startUrl }]);
}
