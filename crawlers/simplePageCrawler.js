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

  const startHost = new URL(startUrl).hostname;

  // Important: pass config as the second argument, not inside options
  const crawler = new PlaywrightCrawler({
    navigationTimeoutSecs: options.navigationTimeoutSecs ?? 30,
    maxRequestRetries:     options.maxRequestRetries     ?? 3,

    requestHandler: async ({ page, request }) => {
      // Clean out scripts/styles/templates/noscript for cleaner text
      await page.evaluate(() => {
        document.querySelectorAll('script,style,template,noscript')
          .forEach(el => el.remove());
      });

      // Extract visible text from the full body
      const textContent = await page.evaluate(() => {
        return document.body.innerText.trim();
      });

      // Collect all unique absolute links, cleaned + only internal
      const links = await page.$$eval('a[href]', (els, startHost) => {
        return [...new Set(
          els
            .map(a => a.href.trim())
            .filter(h => h.startsWith('http'))
            .map(h => {
              try {
                const u = new URL(h);
                // Strip querystring en hash
                u.search = '';
                u.hash = '';
                return u.toString();
              } catch {
                return h;
              }
            })
            // Only keep links on the same hostname as the start URL
            .filter(h => {
              try {
                return new URL(h).hostname === startHost;
              } catch {
                return false;
              }
            })
        )];
      }, startHost);

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
