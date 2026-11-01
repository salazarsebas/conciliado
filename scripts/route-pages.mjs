// Runs after `vite build`. Gives /run and /metrics their own HTML, so a reader without
// JavaScript gets the right title, canonical URL, and text, and publishes the Markdown
// that agents fetch from the site.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://conciliado.acachete.xyz';
const shell = readFileSync('dist/index.html', 'utf8');

const routes = [
  {
    path: 'run',
    title: 'Run a batch | Conciliado',
    text: 'Upload an invoice CSV, review each line, simulate the batch against Arc, and pay it in one transaction signed in your browser wallet. This page needs JavaScript.',
    markdown: '/index.md',
  },
  {
    path: 'metrics',
    title: 'Metrics | Conciliado',
    text: 'This page reads its figures live from Arc mainnet and needs JavaScript. On 2026-11-01: 2 batches, 12 invoice lines, 0.39 USDC paid, 1 payer, 6 payees.',
    markdown: '/metrics.md',
  },
];

for (const route of routes) {
  const html = shell
    .replace(/<title>.*?<\/title>/s, `<title>${route.title}</title>`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${SITE}/${route.path}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${SITE}/${route.path}`)
    .replace(/(<link rel="alternate" type="text\/markdown" href=")[^"]*/, `$1${route.markdown}`)
    .replace(/<noscript>.*?<\/noscript>/s, `<noscript><h1>${route.title.split(' | ')[0]}</h1><p>${route.text} <a href="${route.markdown}">Read the Markdown version</a>.</p></noscript>`);
  if (!html.includes(`${SITE}/${route.path}"`)) throw new Error(`canonical not set for /${route.path}`);
  if (!html.includes(route.text)) throw new Error(`noscript text not set for /${route.path}`);
  mkdirSync(`dist/${route.path}`, { recursive: true });
  writeFileSync(`dist/${route.path}/index.html`, html);
}

copyFileSync('AGENTS.md', 'dist/AGENTS.md');
copyFileSync('docs/submission.md', 'dist/submission.md');
