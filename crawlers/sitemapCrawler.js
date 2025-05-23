/* SITEMAP-CRAWLER
--------------------------------------------------- */
import { XMLParser } from 'fast-xml-parser';

export async function sitemapCrawler(startUrl, runId, options = {}) {
  const sitemapUrl = new URL('/sitemap.xml', startUrl).href;
  const res = await fetch(sitemapUrl);
  if (!res.ok) throw new Error(`No sitemap.xml at ${sitemapUrl}`);

  const xml    = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const json   = parser.parse(xml);
  const urls   = json.urlset?.url?.map(u => u.loc) ?? [];

  console.log(JSON.stringify({ sitemap: sitemapUrl, urls }, null, 2));
}
