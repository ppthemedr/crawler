/* SITEMAP CRAWLER
--------------------------------------------------- */
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

export async function sitemapCrawler(startUrl) {
  const url = new URL('/sitemap.xml', startUrl).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No sitemap found at ${url}`);

  const xml     = await res.text();
  const parser  = new XMLParser();
  const json    = parser.parse(xml);

  const urls = json.urlset?.url?.map(u => u.loc) ?? [];
  console.log(JSON.stringify({ sitemap: url, urls }, null, 2));
}
