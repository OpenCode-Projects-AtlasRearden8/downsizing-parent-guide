# The Downsizing Parent Guide

An emotionally-aware, beginner-friendly manual for helping a parent downsize — from calling the first family meeting to getting the last pickup booked. Written like a friend would: plain English, step by step, never condescending.

**Brought to you by Asdale Dynamics, LLC** — beginner-friendly education, practical tools, and accessible life-admin helpers.

## What's inside

| Chapter | Covers |
| --- | --- |
| 0. Welcome | How to use the manual, the overwhelm-friendly mindset |
| 1. The Family Meeting | Sibling roles, fair-talk scripts, the stop signal, "Ask a professional" discipline |
| 2. Sorting Room by Room | The four doors, 45-minute sessions, the staging zone, overwhelm emergency kit |
| 3. Keep-Heirloom Decision Cards | Six-field cards plus seven starter cards for the hard objects |
| 4. Donation Pickup Planning | Shortlist, backward-scheduled pickups, night-before prep, receipts |
| 5. Floor Plan & Measuring | The 9-measurement sweep, graph-paper plans, green/yellow/red furniture verdicts |
| 6. Estate Sale vs. Auction | How each works, costs and terms, vetting scripts, the hybrid strategy |
| Glossary | Plain-English definitions of every term used — and the ones pros will use |
| Worksheets | Printable Family-Meeting Agenda + Room-Sort Worksheet |

## Run it

Requirements: Node 18+ (built and tested with Node 20, zero dependencies).

```bash
npm install        # no-op (no dependencies) — kept for convention
npm run build      # builds site/ from docs/ (markdown -> static HTML)
npm test           # 22 tests: converter units + end-to-end site checks
```

Then open `site/index.html` directly in a browser, or serve it:

```bash
npx serve site
```

Everything works fully offline — no accounts, no tracking, no external requests. Long-term: clone it, build it, read it.

## Layout

```
docs/           Markdown source for every chapter, worksheet, and the glossary
assets/         Shared stylesheet
scripts/        build.mjs — dependency-free markdown -> HTML static site generator
tests/          Node built-in test suite (npm test)
site/           Generated output (rebuilt by npm run build)
```

## Scope and honesty

This project is **education only**. It is not legal, financial, tax, or medical advice. Wherever the material touches contracts, appraisals, powers of attorney, or taxes, the manual hands you a script for asking a professional — never a substitute for one. Charity rules, disposal regulations, and sale-company terms vary by place and time: always confirm locally.

## Related (deliberately distinct)

- *Moving-Without-Meltdown Guide* — for **your own** move; this one is for **supporting a parent** through theirs.
- *Digital Legacy Handbook* — for what happens to accounts, data, and devices; this one is for the **physical** house and its belongings.

## License

MIT — see [LICENSE](LICENSE). Credit: **Asdale Dynamics, LLC** (2026).
