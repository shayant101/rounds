#!/usr/bin/env node
// Runs every sample client through the drafter and reports what the safety checks caught.
// Mock mode (no key): checks the hand-written sample outputs.
// Live mode (ANTHROPIC_API_KEY set): calls Claude for each sample and checks the real output.
// Usage: node eval/run.js            -> prints a table and writes eval/results.md
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const V = require('../public/verify.js');
const { clients, mocks, callClaude } = require('../server/index.js');

(async () => {
  const live = !!process.env.ANTHROPIC_API_KEY;
  const rows = [];
  for (const c of clients) {
    let draft, model;
    if (live) { const r = await callClaude({ client: c, jottings: c.sample_jottings }); draft = r.draft; model = r.model; }
    else { draft = mocks[c.id]; model = 'hand-written sample'; }
    const chk = V.checkDraft(draft, c.sample_jottings);
    const flagged = chk.items.filter(i => i.status !== 'clean').map(i => `${i.status.toUpperCase()}: "${i.text}" (${i.problems.map(p => p.code).join(', ')})`);
    rows.push({ client: c.id, model, sentences: chk.sentences, traced: chk.clean + chk.amber, red: chk.red, amber: chk.amber, goalLinked: chk.goalLinked, flagged });
  }
  const md = [
    `# Eval results (${live ? 'live Claude' : 'mock outputs'}) — ${new Date().toISOString()}`,
    '',
    '| Client | Model | Lines | Traced to jottings | Red (added/wrong) | Amber (interpretation) | Goal-linked |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.client} | ${r.model} | ${r.sentences} | ${r.traced} | ${r.red} | ${r.amber} | ${r.goalLinked} |`),
    '',
    '## What the checks flagged',
    ...rows.flatMap(r => [`### ${r.client}`, ...(r.flagged.length ? r.flagged.map(f => `- ${f}`) : ['- nothing flagged'])]),
    '',
    'A red line is one the nurse must decide on before the note can be copied. The checker is deterministic string and number matching, not a second AI.'
  ].join('\n');
  fs.writeFileSync(path.join(__dirname, 'results.md'), md);
  console.table(rows.map(({ flagged, ...r }) => r));
  rows.forEach(r => r.flagged.forEach(f => console.log(`  ${r.client}: ${f}`)));
  console.log('\nWrote eval/results.md');
})().catch(e => { console.error(e); process.exit(1); });
