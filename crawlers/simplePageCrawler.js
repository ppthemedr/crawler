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
      // Remove non-content elements for cleaner text
      await page.evaluate(() => {
        document.querySelectorAll('script,style,template,noscript').forEach(el => el.remove());
      });

      // Extract visible text from the full body
      const textContent = await page.evaluate(() => document.body.innerText.trim());

      // Regex: Dutch 06 numbers (+31 or 0 variants)
      const phoneRegex = /(\+31|0)6\s?\d{8}/g;
      const phones = textContent.match(phoneRegex) || [];

      // Detect jQuery version if present
      const jqueryVersion = await page.evaluate(() => {
        if (window.jQuery && window.jQuery.fn && window.jQuery.fn.jquery) return window.jQuery.fn.jquery;
        if (window.$ && window.$.fn && window.$.fn.jquery)               return window.$.fn.jquery;
        return null;
      });

      // Detect WordPress (check for "wp-content" in raw HTML)
      const isWordPress = await page.evaluate(() => {
        return document.documentElement.outerHTML.includes('wp-content');
      });

      // Collect all unique absolute http(s) links, strip only hashes
      const allLinks = await page.$$eval('a[href]', (els) => {
        const urls = new Set();
        for (const a of els) {
          const raw = a.getAttribute('href')?.trim();
          if (!raw) continue;
          try {
            const u = new URL(raw, location.href);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
            u.hash = '';
            urls.add(u.toString());
          } catch {
            // ignore invalid hrefs
          }
        }
        return [...urls];
      });

      // Split into internal / external
      const internalLinks = [];
      const externalLinks = [];
      for (const href of allLinks) {
        try {
          const host = new URL(href).hostname;
          if (host === startHost) internalLinks.push(href);
          else                    externalLinks.push(href);
        } catch {
          // ignore
        }
      }

      // Build output (backward compatible): "links" stays internal,
      // optionally add "externalLinks" when requested via options flag
      const record = {
        url: request.url,
        textContent,
        phones,
        links: internalLinks,
        jqueryVersion,
        isWordPress
      };
      if (options.includeExternalLinks) {
        record.externalLinks = externalLinks;
      }

      // Save
      await itemsDs.pushData(record);
    }
  }, config);

  // Start the crawler with only the given URL
  await crawler.run([{ url: startUrl }]);
}
