// Removes pages marked <meta name="robots" content="noindex"> from the built sitemaps,
// so the sitemap only lists pages we want Google to index. Runs after `astro build`.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const noindex = new Set();
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'index.html' && /<meta name="robots" content="noindex/.test(fs.readFileSync(p, 'utf8'))) {
      const rel = path.relative(dist, path.dirname(p)).split(path.sep).join('/');
      noindex.add(rel ? `/${rel}/` : '/');
    }
  }
};
walk(dist);

let removed = 0;
for (const f of fs.readdirSync(dist).filter((f) => /^sitemap-\d+\.xml$/.test(f))) {
  const file = path.join(dist, f);
  const xml = fs.readFileSync(file, 'utf8');
  const out = xml.replace(/<url>(?:(?!<\/url>).)*?<loc>([^<]+)<\/loc>.*?<\/url>/gs, (block, loc) => {
    if (noindex.has(new URL(loc).pathname)) { removed++; return ''; }
    return block;
  });
  fs.writeFileSync(file, out);
}
console.log(`prune-sitemap: ${noindex.size} noindex pages, ${removed} removed from sitemap`);
