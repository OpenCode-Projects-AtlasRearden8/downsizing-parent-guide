import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { escapeHtml, inline, mdToHtml, resolveMdLink, collectPages, MANUAL_ORDER, build } from '../scripts/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------- unit: escapeHtml ---------------- */

test('escapeHtml escapes angle brackets and ampersands', () => {
  assert.equal(escapeHtml('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
});

/* ---------------- unit: resolveMdLink ---------------- */

test('resolveMdLink maps relative md to site html', () => {
  const pages = new Set(['01-family-meeting.html', 'glossary.html']);
  const r = resolveMdLink('glossary.md', '02-room-by-room.html', pages);
  assert.equal(r.href, 'glossary.html');
  assert.equal(r.external, false);
});

test('resolveMdLink handles subdirectory links both ways', () => {
  const pages = new Set(['worksheets/family-meeting-agenda.html', '01-family-meeting.html']);
  assert.equal(resolveMdLink('worksheets/family-meeting-agenda.md', '01-family-meeting.html', pages).href,
    'worksheets/family-meeting-agenda.html');
  assert.equal(resolveMdLink('../01-family-meeting.md', 'worksheets/family-meeting-agenda.html', pages).href,
    '01-family-meeting.html');
});

test('resolveMdLink returns null for unknown internal targets', () => {
  assert.equal(resolveMdLink('missing.md', 'index.html', new Set()), null);
});

test('resolveMdLink passes through external links', () => {
  const r = resolveMdLink('https://example.com', 'index.html', new Set());
  assert.equal(r.external, true);
  assert.equal(r.href, 'https://example.com');
});

/* ---------------- unit: inline ---------------- */

test('inline renders bold and italic', () => {
  const pages = new Set();
  const html = inline('This is **bold** and *soft* text', 'x.html', pages);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>soft<\/em>/);
});

test('inline renders internal link as clean href', () => {
  const pages = new Set(['glossary.html']);
  const html = inline('see the [Glossary](glossary.md)', '02-room-by-room.html', pages);
  assert.match(html, /<a href="glossary\.html">Glossary<\/a>/);
});

test('inline keeps text (no link) for unresolvable internal link', () => {
  const pages = new Set();
  const html = inline('see the [nowhere](missing.md)', 'x.html', pages);
  assert.ok(!html.includes('<a '));
  assert.match(html, /nowhere/);
});

test('inline escapes stray angle brackets', () => {
  const html = inline('a < b', 'x.html', new Set());
  assert.ok(!html.includes('< b'));
  assert.match(html, /&lt;/);
});

/* ---------------- unit: mdToHtml ---------------- */

test('mdToHtml renders headings, paragraphs, and hr', () => {
  const md = '# Title\n\nFirst paragraph.\n\n---\n\nSecond paragraph.\n';
  const html = mdToHtml(md, 'x.html', new Set());
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<p>First paragraph\.<\/p>/);
  assert.match(html, /<hr>/);
});

test('mdToHtml renders fenced code blocks verbatim', () => {
  const md = '```\nROOM: ____   <tag&> ____\n```\n';
  const html = mdToHtml(md, 'x.html', new Set());
  assert.match(html, /<pre><code>/);
  assert.ok(!html.includes('<tag&>'));
  assert.match(html, /&lt;tag&amp;&gt;/);
});

test('mdToHtml renders tables with header and rows', () => {
  const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n';
  const html = mdToHtml(md, 'x.html', new Set());
  assert.match(html, /<th>A<\/th>/);
  assert.match(html, /<td>2<\/td>/);
  assert.equal((html.match(/<tr>/g) || []).length, 3);
});

test('mdToHtml renders checkbox list items', () => {
  const md = '- [ ] un done\n- [x] done\n';
  const html = mdToHtml(md, 'x.html', new Set());
  assert.match(html, /\u2610/);
  assert.match(html, /\u2611/);
});

test('mdToHtml renders nested lists with balanced tags', () => {
  const md = '- top\n  - sub one\n  - sub two\n- next top\n';
  const html = mdToHtml(md, 'x.html', new Set());
  assert.ok(!html.includes('</li></li>'));
  assert.ok(!html.includes('<ul><li><ul>'));
  const open = (html.match(/<li>/g) || []).length;
  const close = (html.match(/<\/li>/g) || []).length;
  assert.equal(open, close);
  assert.match(html, /top\n<ul>/);
});

test('mdToHtml renders blockquotes', () => {
  const md = '> **Education only.** Not advice.\n\nAfter.\n';
  const html = mdToHtml(md, 'x.html', new Set());
  assert.match(html, /<blockquote>\n<p>/);
  assert.match(html, /<p>After\.<\/p>/);
});

test('mdToHtml blockquote survives escaping of raw html', () => {
  const md = '> <script>alert</script>\n';
  const html = mdToHtml(md, 'x.html', new Set());
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
});

/* ---------------- integration: inventory ---------------- */

test('collectPages finds all 11 markdown pages', () => {
  const pages = collectPages();
  assert.equal(pages.length, MANUAL_ORDER.length);
  const outs = new Set(pages.map((p) => p.out));
  for (const p of MANUAL_ORDER) assert.ok(outs.has(p), `missing page ${p}`);
});

test('docs contain no unresolved internal links (build-time guarantee)', () => {
  // build() itself throws on unregistered pages; here we additionally scan site output
  build();
  for (const out of MANUAL_ORDER) {
    const html = readFileSync(join(ROOT, 'site', out), 'utf8');
    assert.ok(!html.includes('href="#broken"'), `broken internal image in ${out}`);
    assert.ok(!/href="[^"#]*\.md"/.test(html), `raw .md href leaked in ${out}`);
  }
});

/* ---------------- integration: end-to-end content ---------------- */

test('built site contains key content and navigation', () => {
  build();
  const index = readFileSync(join(ROOT, 'site', 'index.html'), 'utf8');
  assert.match(index, /The Downsizing Parent Guide/);
  assert.match(index, /Estate Sale vs\. Auction Basics/);
  assert.match(index, /Family-Meeting Agenda/);
  assert.match(index, /Room-Sort Worksheet/);

  const meeting = readFileSync(join(ROOT, 'site', '01-family-meeting.html'), 'utf8');
  assert.match(meeting, /The Family Meeting: Roles and Fair-Talk Scripts/);
  assert.match(meeting, /The fairness opener/);

  const estate = readFileSync(join(ROOT, 'site', '06-estate-sale-vs-auction.html'), 'utf8');
  assert.match(estate, /Reserve price/);
  assert.match(estate, /Buyer's premium/);

  for (const out of MANUAL_ORDER) {
    const html = readFileSync(join(ROOT, 'site', out), 'utf8');
    assert.match(html, /© Asdale Dynamics, LLC/);
    assert.match(html, /not legal, financial, tax, or medical advice|Education only/);
    assert.match(html, /<!DOCTYPE html>/);
  }
});

test('prev/next navigation links each chapter', () => {
  build();
  const welcome = readFileSync(join(ROOT, 'site', '00-welcome.html'), 'utf8');
  assert.match(welcome, /href="01-family-meeting\.html"/);
  const glossary = readFileSync(join(ROOT, 'site', 'glossary.html'), 'utf8');
  assert.match(glossary, /href="06-estate-sale-vs-auction\.html"/);
});

test('worksheets output is print-friendly', () => {
  build();
  for (const ws of ['worksheets/family-meeting-agenda.html', 'worksheets/room-sort-worksheet.html']) {
    const html = readFileSync(join(ROOT, 'site', ws), 'utf8');
    assert.match(html, /@media print/);
    assert.match(html, /class="page worksheet"/);
  }
});

/* ---------------- isolation: build into a temp copy does not leak ---------------- */

test('build() rejects unregistered pages added to docs/', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dpg-'));
  try {
    const docs = join(tmp, 'docs');
    mkdirSync(docs, { recursive: true });
    writeFileSync(join(docs, 'stray.md'), '# Stray\n');
    assert.throws(() => build({ docsDir: docs }), /Unregistered page/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
