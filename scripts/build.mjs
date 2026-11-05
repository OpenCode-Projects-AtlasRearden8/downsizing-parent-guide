#!/usr/bin/env node
/**
 * Build script for The Downsizing Parent Guide.
 * Converts markdown in docs/ to a self-contained static HTML site in site/.
 * Zero dependencies — Node built-ins only. Local-first by design.
 *
 * Usage: node scripts/build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, cpSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const SITE = join(ROOT, 'site');
const ASSETS = join(ROOT, 'assets');

export const SITE_TITLE = 'The Downsizing Parent Guide';

/* ------------------------------------------------------------------ */
/* Page inventory                                                      */
/* ------------------------------------------------------------------ */

/** Ordered list of source md files -> output html paths (relative to site/). */
export function collectPages(docsDir = DOCS) {
  const pages = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, prefix ? `${prefix}/${entry.name}` : entry.name);
      } else if (entry.name.endsWith('.md')) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        pages.push({ src: full, out: rel.replace(/\.md$/, '.html') });
      }
    }
  };
  walk(docsDir, '');
  return pages;
}

/* ------------------------------------------------------------------ */
/* Markdown -> HTML (small, dependency-free, tuned to this site)       */
/* ------------------------------------------------------------------ */

export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Map a relative .md href to an output .html path; null if it can't resolve. */
export function resolveMdLink(href, fromOutPath, outPaths) {
  if (/^https?:\/\//i.test(href) || href.startsWith('mailto:')) return { href, external: true };
  if (href.startsWith('#')) return { href, external: false };
  const fromDir = dirname('/' + fromOutPath);
  const target = resolve('/' + fromDir, href)
    .replace(/\\/g, '/')
    .replace(/^\//, '');
  const htmlPath = target.replace(/\.md$/, '.html');
  if (outPaths.has(htmlPath)) return { href: htmlPath, external: false };
  return null;
}

/** Inline formatting: escape, code, images, links, bold, italic. */
export function inline(md, fromOutPath, outPaths) {
  let text = escapeHtml(md);
  const codes = [];
  text = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, href) => {
    const resolved = resolveMdLink(href, fromOutPath, outPaths);
    if (!resolved && !/^https?:\/\//i.test(href)) {
      return `<img src="#broken" alt="${alt}">`;
    }
    return `<img src="${resolved.href}" alt="${alt}">`;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    const resolved = resolveMdLink(href, fromOutPath, outPaths);
    if (!resolved && !/^https?:\/\//i.test(href)) return label; // keep text, drop link
    if (resolved.external) {
      return `<a href="${resolved.href}" target="_blank" rel="noopener">${label}</a>`;
    }
    return `<a href="${resolved.href}">${label}</a>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[\s(>])\*([^*\n]+)\*(?=$|[\s).,:;!?])/g, '$1<em>$2</em>');
  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return text.trim();
}

const OPEN_BOX = '\u2610'; //

/** Render an list line's text, handling checkboxes. */
function listItemInline(raw, fromOutPath, outPaths) {
  const cb = raw.match(/^\[([ xX])\]\s+(.*)$/);
  if (cb) {
    const box = cb[1] === ' ' ? OPEN_BOX : '\u2611';
    return `<span class="checkbox" aria-hidden="true">${box}</span>${inline(cb[2], fromOutPath, outPaths)}`;
  }
  return inline(raw, fromOutPath, outPaths);
}

/** Parse one list block starting at lines[start]; supports one nesting level via indent. */
function parseList(lines, start, fromOutPath, outPaths) {
  const orderedRe = /^\s*(\d+)[.)]\s+/;
  const unorderedRe = /^\s*[-*]\s+/;
  let i = start;
  const flat = [];
  let sawOrdered = false;
  let sawUnordered = false;
  while (i < lines.length) {
    const line = lines[i];
    const isOrd = orderedRe.test(line);
    const isUnord = unorderedRe.test(line);
    if (!isOrd && !isUnord) {
      // allow wrapped lines that are indented continuation
      if (/^\s{2,}/.test(line) && flat.length && line.trim() && !line.trim().startsWith('#')) {
        flat[flat.length - 1].text += ' ' + line.trim();
        i++;
        continue;
      }
      break;
    }
    if (isOrd) sawOrdered = true;
    if (isUnord) sawUnordered = true;
    const indent = line.match(/^\s*/)[0].length;
    const level = indent >= 2 ? 1 : 0;
    const rest = isOrd ? line.replace(orderedRe, '') : line.replace(unorderedRe, '');
    flat.push({ level, ordered: isOrd, text: listItemInline(rest, fromOutPath, outPaths) });
    i++;
  }
  const ul = sawUnordered && !sawOrdered;
  const outer = ul ? 'ul' : 'ol';
  // build a tree from flat items, then render recursively
  const root = { children: [] };
  const stack = [{ level: 0, node: root }];
  const nodes = [];
  for (const item of flat) {
    const level = item.level + 1;
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1].node;
    const node = { text: item.text, ordered: item.ordered, children: [] };
    parent.children.push(node);
    nodes.push(node);
    stack.push({ level, node });
  }
  const renderItems = (items, tag) => {
    let html = `<${tag}>\n`;
    for (const n of items) {
      html += `<li>${n.text}`;
      if (n.children.length) html += '\n' + renderItems(n.children, n.children[0].ordered ? 'ol' : 'ul') + '\n';
      html += '</li>\n';
    }
    html += `</${tag}>\n`;
    return html;
  };
  return { html: renderItems(root.children, outer), end: i };
}

/** Render table lines (already matched) to an HTML table. */
function renderTable(rows, fromOutPath, outPaths) {
  const split = (r) => r.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const header = split(rows[0]);
  const body = rows.slice(2).map(split);
  let html = '<table>\n<thead>\n<tr>';
  for (const cell of header) html += `<th>${inline(cell, fromOutPath, outPaths)}</th>`;
  html += '</tr>\n</thead>\n<tbody>\n';
  for (const row of body) {
    html += '<tr>';
    for (const cell of row) html += `<td>${inline(cell, fromOutPath, outPaths)}</td>`;
    html += '</tr>\n';
  }
  html += '</tbody>\n</table>\n';
  return html;
}

/** Convert a markdown document to an HTML fragment (body content). */
export function mdToHtml(md, fromOutPath, outPaths) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let inCode = false;
  let codeLang = '';
  let codeBuf = [];
  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        codeBuf = [];
        i++;
        continue;
      } else {
        out.push(`<pre><code${codeLang ? ` class="language-${codeLang}"` : ''}>${escapeHtml(codeBuf.join('\n'))}</code></pre>\n`);
        inCode = false;
        i++;
        continue;
      }
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }

    // blank
    if (!line.trim()) { i++; continue; }

    // horizontal rule
    if (/^(---+|\*\*\*)\s*$/.test(line)) { out.push('<hr>\n'); i++; continue; }

    // heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = inline(h[2], fromOutPath, outPaths);
      out.push(`<h${level}>${text}</h${level}>\n`);
      i++;
      continue;
    }

    // blockquote
    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const inner = mdToHtml(buf.join('\n'), fromOutPath, outPaths);
      out.push(`<blockquote>\n${inner}</blockquote>\n`);
      continue;
    }

    // table (header row + separator row of dashes)
    const next = lines[i + 1] || '';
    if (/^\|.*\|\s*$/.test(line) && /^\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(next)) {
      const rows = [line, next];
      i += 2;
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
      out.push(renderTable(rows, fromOutPath, outPaths));
      continue;
    }

    // lists
    if (/^\s*([-*]|\d+[.)])\s+/.test(line)) {
      const { html, end } = parseList(lines, i, fromOutPath, outPaths);
      out.push(html);
      i = end;
      continue;
    }

    // paragraph
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() &&
      !/^(#{1,4}\s|>|\||```|\s*[-*]\s|\s*\d+[.)]\s|---+\s*\*\*\*)/.test(lines[i]) &&
      !/^(-{3,}|\*{3,})\s*$/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    const text = buf.map((b) => b.trim()).join(' ');
    out.push(`<p>${inline(text, fromOutPath, outPaths)}</p>\n`);
  }
  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>\n`);
  }
  return out.join('');
}

/* ------------------------------------------------------------------ */
/* Page shell                                                          */
/* ------------------------------------------------------------------ */

export function readCss() {
  return readFileSync(join(ASSETS, 'style.css'), 'utf8');
}

function extractTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].replace(/\*\*/g, '') : 'Untitled';
}

export function renderPage({ title, body, css, nav, prevNext, isWorksheet, footerYear = '2026' }) {
  const year = footerYear;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${SITE_TITLE}</title>
<style>
${css}
</style>
</head>
<body>
<header class="site-header">
  <a class="brand" href="index.html">${SITE_TITLE}</a>
  <nav class="topnav">
    ${nav}
  </nav>
</header>
<main class="page ${isWorksheet ? 'worksheet' : ''}">
<nav class="prevnext top">${prevNext}</nav>
<article>
${body}
</article>
<nav class="prevnext bottom">${prevNext}</nav>
</main>
<footer class="site-footer">
  <p><strong>${SITE_TITLE}</strong> © Asdale Dynamics, LLC ${year}</p>
  <p class="fineprint">Education only — this site is general information, not legal, financial, tax, or medical advice. For document, appraisal, contract, or money questions, please bring real numbers to a local professional.</p>
</footer>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export const MANUAL_ORDER = [
  'index.html',
  '00-welcome.html',
  '01-family-meeting.html',
  '02-room-by-room.html',
  '03-heirloom-cards.html',
  '04-donation-pickup.html',
  '05-floor-plan.html',
  '06-estate-sale-vs-auction.html',
  'glossary.html',
  'worksheets/family-meeting-agenda.html',
  'worksheets/room-sort-worksheet.html',
];

const LABELS = {
  'index.html': 'Home',
  '00-welcome.html': 'Welcome',
  '01-family-meeting.html': 'Family Meeting',
  '02-room-by-room.html': 'Room by Room',
  '03-heirloom-cards.html': 'Heirloom Cards',
  '04-donation-pickup.html': 'Donation Pickup',
  '05-floor-plan.html': 'Floor Plan',
  '06-estate-sale-vs-auction.html': 'Estate Sale vs Auction',
  'glossary.html': 'Glossary',
  'worksheets/family-meeting-agenda.html': 'Family-Meeting Agenda',
  'worksheets/room-sort-worksheet.html': 'Room-Sort Worksheet',
};

function chapterNav(outPath) {
  const chapters = MANUAL_ORDER.filter((p) => /[0-9]+-/.test(p));
  const links = chapters
    .map((p) => {
      const n = p.startsWith('0') || p.startsWith('1') ? p.slice(0, 2) : '';
      const label = (n ? `${Number(n)}. ` : '') + LABELS[p];
      const active = p === outPath ? ' class="active"' : '';
      return `<a href="${posix2web(p)}"${active}>${label}</a>`;
    })
    .join('\n');
  return links;
}

function posix2web(p) { return p; }

function worksheetNav(outPath) {
  const ws = ['worksheets/family-meeting-agenda.html', 'worksheets/room-sort-worksheet.html'];
  return ws.map((p) => `<a href="${p}" class="${p === outPath ? 'active' : ''}">${LABELS[p]}</a>`).join('\n');
}

function glossaryNav(outPath) {
  return `<a href="glossary.html" class="${outPath === 'glossary.html' ? 'active' : ''}">Glossary</a>`;
}

function makeTopNav(outPath) {
  return [
    `<a href="index.html" class="${outPath === 'index.html' ? 'active' : ''}">Home</a>`,
    `<details class="nav-group" ${MANUAL_ORDER.slice(1, 8).includes(outPath) ? 'open' : ''}>` +
      `<summary>Chapters</summary><div class="nav-links">${chapterNav(outPath)}</div></details>`,
    `<details class="nav-group" ${outPath.startsWith('worksheets/') ? 'open' : ''}>` +
      `<summary>Worksheets</summary><div class="nav-links">${worksheetNav(outPath)}</div></details>`,
    glossaryNav(outPath),
  ].join('\n');
}

function makePrevNext(outPath) {
  const idx = MANUAL_ORDER.indexOf(outPath);
  const prev = idx > 0 ? MANUAL_ORDER[idx - 1] : null;
  const next = idx >= 0 && idx < MANUAL_ORDER.length - 1 ? MANUAL_ORDER[idx + 1] : null;
  const parts = [];
  parts.push(prev ? `<a href="${prev}" class="prev">← ${LABELS[prev] || 'Previous'}</a>` : '<span class="prev muted"></span>');
  parts.push(next ? `<a href="${next}" class="next">${LABELS[next] || 'Next'} →</a>` : '<span class="next muted"></span>');
  return parts.join('\n');
}

export function build({ docsDir = DOCS } = {}) {
  const pages = collectPages(docsDir);
  const outPaths = new Set(pages.map((p) => p.out));

  // sanity: every page in MANUAL_ORDER exists; report unknowns
  for (const p of pages) {
    if (!MANUAL_ORDER.includes(p.out)) {
      throw new Error(`Unregistered page in docs/: ${p.out} — add it to MANUAL_ORDER or LABELS.`);
    }
  }

  if (existsSync(SITE)) rmSync(SITE, { recursive: true, force: true });
  mkdirSync(SITE, { recursive: true });

  const css = readCss();
  const built = [];

  for (const page of pages) {
    const md = readFileSync(page.src, 'utf8');
    const title = extractTitle(md);
    const body = mdToHtml(md, page.out, outPaths);
    const isWorksheet = page.out.startsWith('worksheets/');
    const html = renderPage({
      title,
      body,
      css,
      nav: makeTopNav(page.out),
      prevNext: makePrevNext(page.out),
      isWorksheet,
    });
    const dest = join(SITE, page.out);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, html);
    built.push(page.out);
  }

  // copy assets (any non-css extras) — currently none, but local-first friendly
  if (existsSync(ASSETS)) {
    for (const f of readdirSync(ASSETS)) {
      if (f === 'style.css') continue;
      const src = join(ASSETS, f);
      if (statSync(src).isFile()) cpSync(src, join(SITE, f));
    }
  }

  return built;
}

/* CLI entry */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = build();
  console.log(`Built ${files.length} pages into site/`);
  for (const f of files) console.log(`  ✓ site/${f}`);
}
