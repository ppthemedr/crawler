// simplePageCrawler.js
/* SIMPLE PAGE CRAWLER WITH STORAGE DIR SUPPORT
--------------------------------------------------- */
import { PlaywrightCrawler, Dataset, Configuration } from 'crawlee';

/* CRAWLER FUNCTION
--------------------------------------------------- */
export async function simplePageCrawler(startUrl, runId, options = {}, storageDir = '/app/storage') {
  const config = new Configuration({ storageDir });

  // Open dataset in the correct storageDir
  const itemsDs = await Dataset.open(runId, { config });

  // Important: pass config as the second argument, not inside options
  const crawler = new PlaywrightCrawler({
    navigationTimeoutSecs: options.navigationTimeoutSecs ?? 30,
    maxRequestRetries:     options.maxRequestRetries     ?? 3,

    requestHandler: async ({ page, request }) => {
      // Clean out scripts/styles to get cleaner text
      await page.evaluate(() => {
        document.querySelectorAll('script,style,template,noscript')
          .forEach(el => el.remove());
      });

      // Extract visible text from main content area or body
      const textContent = await page.evaluate(() => {
        const root = document.querySelector('main,article,#content');
        return (root ?? document.body).innerText.trim();
      });

      // Collect all unique absolute links
      const links = await page.$$eval('a[href]', els =>
        [...new Set(
          els.map(a => a.href.trim())
             .filter(h => h.startsWith('http'))
        )]
      );

      // Save URL, text and links to dataset
      await itemsDs.pushData({
        url: request.url,
        textContent,
        links
      });
    }
  }, config); // <-- pass Configuration here, not inside options

  // Start the crawler with only the given URL
  await crawler.run([{ url: startUrl }]);
}
