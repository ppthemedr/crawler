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

      // Regex: vind alleen Nederlandse 06-nummers (+31 of 0 varianten)
      const phoneRegex = /(\+31|0)6\s?\d{8}/g;
      const phones = textContent.match(phoneRegex) || [];

      // Detect jQuery version if present
      const jqueryVersion = await page.evaluate(() => {
        if (window.jQuery && window.jQuery.fn && window.jQuery.fn.jquery) {
          return window.jQuery.fn.jquery;
        }
        if (window.$ && window.$.fn && window.$.fn.jquery) {
          return window.$.fn.jquery;
        }
        return null;
      });

      // Detect WordPress (check for "wp-content" in raw HTML)
      const isWordPress = await page.evaluate(() => {
        return document.documentElement.outerHTML.includes('wp-content');
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
                // Strip alleen anchors (#something), laat querystrings staan
                u.hash = '';
                return u.toString();
              } catch {
                return h;
              }
            })
            .filter(h => {
              try {
                return new URL(h).hostname === startHost;
              } catch {
                return false;
              }
            })
        )];
      }, startHost);

      // Save URL, text, phones, links, jqueryVersion, and WordPress detection
      await itemsDs.pushData({
        url: request.url,
        textContent,
        phones,
        links,
        jqueryVersion,
        isWordPress
      });
    }
  }, config);

  // Start the crawler with only the given URL
  await crawler.run([{ url: startUrl }]);
}
