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

      // Extract visible text
      const textContent = await page.evaluate(() => document.body.innerText.trim());

      // Regex: Dutch 06 numbers (+31 or 0 variants)
      const phoneRegex = /(\+31|0)6\s?\d{8}/g;
      const phones = textContent.match(phoneRegex) || [];

      // Detect jQuery version if present
      const jqueryVersion = await page.evaluate(() => {
        if (window.jQuery?.fn?.jquery) return window.jQuery.fn.jquery;
        if (window.$?.fn?.jquery)      return window.$.fn.jquery;
        return null;
      });

      // Detect WordPress
      const isWordPress = await page.evaluate(() => {
        return document.documentElement.outerHTML.includes('wp-content');
      });

      // Collect all unique absolute links (internal + external), strip only hashes
      const allLinks = await page.$$eval('a[href]', (els) => {
        const urls = new Set();
        for (const a of els) {
          const raw = a.getAttribute('href')?.trim();
          if (!raw) continue;
          try {
            // Resolve relative URLs against the current page URL
            const u = new URL(raw, location.href);
            // Ignore non-http(s)
            if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
            // Strip only the fragment
            u.hash = '';
            urls.add(u.toString());
          } catch {
            // Skip invalid hrefs
          }
        }
        return [...urls];
      });

      // Split into internal / external, based on hostname
      const internalLinks = [];
      const externalLinks = [];
      for (const href of allLinks) {
        try {
          const host = new URL(href).hostname;
          (host === startHost ? internalLinks : externalLinks).push(href);
        } catch {
          // ignore
        }
      }

      // Save URL, text, phones, link buckets, jqueryVersion, and WordPress flag
      await itemsDs.pushData({
        url: request.url,
        textContent,
        phones,
        links: {
          internal: internalLinks,
          external: externalLinks
        },
        jqueryVersion,
        isWordPress
      });
    }
  }, config);

  // Start the crawler with only the given URL
  await crawler.run([{ url: startUrl }]);
}
