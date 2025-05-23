/* SITEMAP CRAWLER
--------------------------------------------------- */
import { XMLParser } from 'fast-xml-parser';   // fast-xml-parser blijft nodig
import { Dataset } from 'crawlee';

export async function sitemapCrawler(startUrl) {
  const url = new URL('/sitemap.xml', startUrl).href;

  const res = await fetch(url);                // ingebouwde fetch
  if (!res.ok) throw new Error(`No sitemap at ${url}`);

  const xml    = await res.text();
  const parser = new XMLParser();
  const json   = parser.parse(xml);

  const urls = json.urlset?.url?.map(u => u.loc) ?? [];
  console.log(JSON.stringify({ sitemap: url, urls }, null, 2));
}
