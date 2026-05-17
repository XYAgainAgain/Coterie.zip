#!/usr/bin/env tsx
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const DATA_DIR = resolve(REPO_ROOT, 'vamp/public/data');
const OUT_FILE = resolve(REPO_ROOT, 'minions/data-viewer.html');

const files = readdirSync(DATA_DIR)
  .filter(f => f.endsWith('.json'))
  .sort();

if (files.length === 0) {
  console.error('No JSON files found in vamp/public/data/. Run `npm run parse` first.');
  process.exit(1);
}

const datasets: Record<string, unknown> = {};
for (const f of files) {
  const key = basename(f, '.json');
  try {
    datasets[key] = JSON.parse(readFileSync(resolve(DATA_DIR, f), 'utf-8'));
  } catch (err) {
    console.error(`Failed to parse ${f}: ${(err as Error).message}`);
    process.exit(1);
  }
}

/* eslint-disable no-useless-escape */
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Coterie Data Viewer</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IM+Fell+English+SC&family=Merriweather+Sans:wght@300;400;600&family=Metamorphous&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #070707;
  --bg-secondary: #0f0d14;
  --bg-elevated: #1A1030;
  --bg-sunken: #040404;
  --text: #E8E8E8;
  --text-secondary: #c0c0c0;
  --text-muted: #7a7490;
  --accent: #A88BFF;
  --accent-hover: #c4adff;
  --accent-subtle: rgba(168, 139, 255, 0.15);
  --border: #2a2438;
  --glass-bg: hsla(270, 30%, 5%, 0.85);
  --glass-border: hsla(260, 50%, 60%, 0.12);
  --danger: #c62828;
  --font-body: 'Merriweather Sans', system-ui, sans-serif;
  --font-heading: 'IM Fell English SC', 'Metamorphous', serif;
  --font-display: 'Metamorphous', serif;
}

html { font-size: 16px; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  line-height: 1.6;
  min-height: 100vh;
}

a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-hover); text-decoration: underline; }

.shell {
  display: grid;
  grid-template-columns: 14rem 1fr;
  min-height: 100vh;
}

nav {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  padding: 1.5rem 0;
}

nav h1 {
  font-family: var(--font-display);
  font-size: 1.25rem;
  color: var(--accent);
  padding: 0 1rem 1rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.75rem;
}

nav button {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: 0.85rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
nav button:hover { background: var(--accent-subtle); color: var(--text); }
nav button.active { background: var(--accent-subtle); color: var(--accent); border-left: 3px solid var(--accent); }

nav .meta {
  padding: 0.75rem 1rem 0;
  border-top: 1px solid var(--border);
  margin-top: 0.75rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

main {
  padding: 2rem 3rem;
  max-width: 60rem;
  overflow-y: auto;
}

main h2 {
  font-family: var(--font-display);
  font-size: 1.75rem;
  color: var(--accent);
  margin-bottom: 0.5rem;
}

main .subtitle {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin-bottom: 2rem;
}

.card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.card-header:hover { background: var(--accent-subtle); }

.card-header h3 {
  font-family: var(--font-heading);
  font-size: 1.15rem;
  color: var(--text);
  font-weight: normal;
}

.card-header .badge {
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 1rem;
  background: var(--accent-subtle);
  color: var(--accent);
  font-family: var(--font-body);
  white-space: nowrap;
}

.card-body {
  display: none;
  padding: 0 1rem 1rem;
  border-top: 1px solid var(--border);
}
.card.open .card-body { display: block; }

.field { margin-top: 0.75rem; }

.field-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 0.15rem;
}

.field-value {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
}
.field-value p { margin: 0.25rem 0; }
.field-value ul, .field-value ol { padding-left: 1.25rem; margin: 0.25rem 0; }
.field-value strong { color: var(--text); }
.field-value em { font-style: italic; }

.field-value h2, .field-value h3, .flavor h2, .flavor h3 {
  font-family: var(--font-heading);
  color: var(--text);
  margin: 1rem 0 0.5rem;
  font-size: 1.1rem;
  font-weight: normal;
}
.field-value h2 { font-size: 1.2rem; }

.tier.lvl-1 { border-left-color: #6a5acd; }
.tier.lvl-1 .tier-label { color: #8b7ee8; }
.tier.lvl-2 { border-left-color: #7b5ea7; }
.tier.lvl-2 .tier-label { color: #9878c0; }
.tier.lvl-3 { border-left-color: #8c6282; }
.tier.lvl-3 .tier-label { color: #a67a98; }
.tier.lvl-4 { border-left-color: #9d665c; }
.tier.lvl-4 .tier-label { color: #b47d70; }
.tier.lvl-5 { border-left-color: #ae6a37; }
.tier.lvl-5 .tier-label { color: #c2803e; }

.inline-tier-10 { color: #66bb6a; font-weight: bold; }
.inline-tier-7 { color: #ff9800; font-weight: bold; }
.inline-tier-6 { color: #ef5350; font-weight: bold; }
.inline-tier-12 { color: var(--accent); font-weight: bold; }

.tier.merit { border-left-color: #4a7c59; }
.tier.merit .tier-label { color: #6a9e78; }
.tier.flaw { border-left-color: #8c4444; }
.tier.flaw .tier-label { color: #b05858; }
.tier.compulsion { border-left-color: #8c7a30; }
.tier.compulsion .tier-label { color: #b09a40; }

.tier.group-all { border-left-color: #2e7d32; }
.tier.group-all .tier-label { color: #66bb6a; }
.tier.group-half { border-left-color: #e65100; }
.tier.group-half .tier-label { color: #ff9800; }
.tier.group-less { border-left-color: #c62828; }
.tier.group-less .tier-label { color: #ef5350; }
.tier.group-none { border-left-color: #6a1b1b; }
.tier.group-none .tier-label { color: #a04040; }

.stat-bar {
  display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.35rem;
}
.stat-chip {
  font-family: var(--font-body); font-size: 0.85rem; color: var(--text-secondary);
}
.stat-chip strong { color: var(--text); }

.pick-count {
  font-size: 0.75rem; color: var(--text-muted); font-style: italic;
  margin-bottom: 0.25rem;
}
.feature-list { margin: 0; padding-left: 1.25rem; }
.feature-list li { font-size: 0.85rem; color: var(--text-secondary); margin: 0.15rem 0; }

.hold-list { margin-top: 0.5rem; }
.hold-list .field-label { margin-bottom: 0.25rem; }
.hold-list ul { padding-left: 1.25rem; margin: 0; }
.hold-list li { font-size: 0.85rem; color: var(--text-secondary); margin: 0.15rem 0; }

.admonition { margin: 0.75rem 0; padding: 0.5rem 0.75rem; border-left: 3px solid var(--text-muted); background: var(--bg-sunken); border-radius: 0.25rem; font-size: 0.85rem; color: var(--text-secondary); }
.admonition-title { font-weight: 600; color: var(--text); margin-bottom: 0.25rem; }

.field-value.stat {
  color: var(--accent);
  font-family: var(--font-heading);
  font-size: 1rem;
}

.null-value { color: var(--text-muted); font-style: italic; font-size: 0.85rem; }

.tier {
  margin-top: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: var(--bg-sunken);
  border-radius: 0.35rem;
  border-left: 3px solid var(--accent);
}
.tier.tier-10 { border-left-color: #2e7d32; }
.tier.tier-7 { border-left-color: #e65100; }
.tier.tier-6 { border-left-color: var(--danger); }
.tier.tier-12 { border-left-color: var(--accent); }

.tier-label {
  font-family: var(--font-display);
  font-size: 0.85rem;
  margin-bottom: 0.25rem;
}
.tier.tier-10 .tier-label { color: #66bb6a; }
.tier.tier-7 .tier-label { color: #ff9800; }
.tier.tier-6 .tier-label { color: #ef5350; }
.tier.tier-12 .tier-label { color: var(--accent); }

.tier .field-value { font-size: 0.85rem; }

.threshold {
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-sunken);
  border-radius: 0.35rem;
  border-left: 3px solid var(--accent);
}
.threshold-label {
  font-family: var(--font-display);
  font-size: 0.85rem;
  color: var(--accent);
  margin-bottom: 0.15rem;
}

.threshold.blush-0 { border-left-color: #e8a0b0; }
.threshold.blush-0 .threshold-label { color: #e8a0b0; }
.threshold.blush-1 { border-left-color: #daa0a8; }
.threshold.blush-1 .threshold-label { color: #daa0a8; }
.threshold.blush-2 { border-left-color: #cca0a4; }
.threshold.blush-2 .threshold-label { color: #cca0a4; }
.threshold.blush-3 { border-left-color: #c0a4a8; }
.threshold.blush-3 .threshold-label { color: #c0a4a8; }
.threshold.blush-4 { border-left-color: #b4a8b0; }
.threshold.blush-4 .threshold-label { color: #b4a8b0; }
.threshold.blush-5 { border-left-color: #b0b0b8; }
.threshold.blush-5 .threshold-label { color: #b0b0b8; }
.threshold.blush-6 { border-left-color: #c8c8d0; }
.threshold.blush-6 .threshold-label { color: #c8c8d0; }

.search-box {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  border-radius: 0.35rem;
  color: var(--text);
  font-family: var(--font-body);
  font-size: 0.85rem;
  margin-bottom: 1.5rem;
  outline: none;
  transition: border-color 0.15s;
}
.search-box:focus { border-color: var(--accent); }
.search-box::placeholder { color: var(--text-muted); }

.flavor {
  margin-top: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.35rem;
  overflow: hidden;
}
.flavor summary {
  padding: 0.5rem 0.75rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, color 0.15s;
}
.flavor summary:hover { background: var(--accent-subtle); color: var(--text-secondary); }
.flavor[open] summary { border-bottom: 1px solid var(--border); color: var(--text-secondary); }
.flavor > .field-value {
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.hidden { display: none !important; }
</style>
</head>
<body>
<div class="shell">
  <nav>
    <h1>Coterie Data</h1>
    <div id="nav-buttons"></div>
    <div class="meta" id="gen-meta"></div>
  </nav>
  <main id="content"></main>
</div>

<script src="https://cdn.jsdelivr.net/npm/marked@18/lib/marked.umd.js"><\/script>
<script>
/* Data embedded at generation time; re-run build-viewer.ts to refresh */
const DATA = ${JSON.stringify(datasets)};

/* Per-dataset renderers; new parsers get the fallback renderer automatically */
const RENDERERS = {};

function stripMkdocs(text) {
  if (!text) return '';
  var s = String(text);
  s = s.replace(/!\\[.*?\\]\\(.*?\\)\\{[^}]*\\}/g, '');
  s = s.replace(/!\\[.*?\\]\\(.*?\\)/g, '');
  s = s.replace(/^!!! *(\\w+) *"([^"]*)"\\n\\n?((?:    .*\\n?)*)/gm, function(m, type, title, body) {
    var clean = body.replace(/^    /gm, '').trim();
    return '<div class="admonition"><div class="admonition-title">' + title + '</div>' + marked.parse(clean) + '</div>\\n';
  });
  s = s.replace(/^!!! *(\\w+)\\s*\\n\\n?((?:    .*\\n?)*)/gm, function(m, type, body) {
    var clean = body.replace(/^    /gm, '').trim();
    return '<div class="admonition">' + marked.parse(clean) + '</div>\\n';
  });
  return s;
}

function md(text) {
  if (!text) return '';
  return marked.parse(stripMkdocs(String(text)), { breaks: false });
}

function mdColorTiers(text) {
  if (!text) return '';
  var rendered = md(text);
  rendered = rendered.replace(/<strong>(?:Advanced: )?On a (\\d+[^<]*?),?<\\/strong>/g, function(m, tier) {
    var cls = 'inline-tier-';
    if (tier.startsWith('12')) cls += '12';
    else if (tier.startsWith('10')) cls += '10';
    else if (tier.startsWith('7')) cls += '7';
    else if (tier.startsWith('6')) cls += '6';
    else return m;
    return '<strong class="' + cls + '">' + m.replace(/<\\/?strong>/g, '') + '</strong>';
  });
  return rendered;
}

function cap(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function fieldHtml(label, value, opts) {
  opts = opts || {};
  if (value === null || value === undefined) {
    return '<div class="field"><div class="field-label">' + esc(label) + '</div><div class="null-value">none</div></div>';
  }
  var cls = opts.stat ? 'field-value stat' : 'field-value';
  var rendered = opts.raw ? value : md(String(value));
  return '<div class="field"><div class="field-label">' + esc(label) + '</div><div class="' + cls + '">' + rendered + '</div></div>';
}

function tierClass(tier) {
  if (tier.startsWith('10')) return 'tier-10';
  if (tier.startsWith('7')) return 'tier-7';
  if (tier.startsWith('6')) return 'tier-6';
  if (tier.startsWith('12')) return 'tier-12';
  return '';
}

function tierLabel(tier) {
  if (tier.startsWith('12')) return 'Advanced: ' + tier;
  return 'On a ' + tier;
}

RENDERERS['age-brackets'] = function(entry) {
  var html = fieldHtml('Embraced', entry.embraced);
  if (entry.flavor) {
    html += '<details class="flavor"><summary>Background</summary><div class="field-value">' + md(entry.flavor) + '</div></details>';
  }
  html += fieldHtml('Starting Humanity', entry.startingHumanity)
    + fieldHtml('Starting Blood Potency', String(entry.startingBloodPotency))
    + fieldHtml('Advancement', entry.advancement)
    + fieldHtml('Predator Type', entry.predatorType)
    + fieldHtml('Narrative Feel', entry.narrativeFeel);
  return html;
};

RENDERERS['predator-types'] = function(entry) {
  var html = fieldHtml('Hunting Stat', entry.huntingStat, { stat: true })
    + fieldHtml('Discipline', entry.discipline, { stat: true });
  html += '<div class="tier merit"><div class="tier-label">Merit</div><div class="field-value">' + md(entry.merit) + '</div></div>';
  html += '<div class="tier flaw"><div class="tier-label">Flaw</div><div class="field-value">' + md(entry.flaw) + '</div></div>';
  if (entry.humanity) html += fieldHtml('Humanity', entry.humanity);
  if (entry.feedingRules) html += fieldHtml('Feeding Rules', entry.feedingRules);
  return html;
};

RENDERERS['basic-moves'] = function(entry) {
  var html = fieldHtml('Trigger', '**' + entry.trigger + '**');
  if (entry.rollStat) html += fieldHtml('Roll Stat', entry.rollStat, { stat: true });
  if (entry.statOptions) {
    html += '<div class="field"><div class="field-label">Stat Options</div><div class="field-value"><ul>';
    for (var s = 0; s < entry.statOptions.length; s++) {
      html += '<li>' + md(entry.statOptions[s]) + '</li>';
    }
    html += '</ul></div></div>';
  }
  if (entry.type === 'blush-of-life') {
    html += '<div class="field"><div class="field-label">Humanity Thresholds</div>';
    for (var i = 0; i < entry.humanityThresholds.length; i++) {
      var t = entry.humanityThresholds[i];
      html += '<div class="threshold blush-' + i + '"><div class="threshold-label">' + esc(t.threshold) + '</div><div class="field-value">' + md(cap(t.description)) + '</div></div>';
    }
    html += '</div>';
    if (entry.advanced) {
      html += '<div class="tier tier-12"><div class="tier-label">Advanced: 12+</div><div class="field-value">' + md(cap(entry.advanced)) + '</div></div>';
    }
  } else if (entry.outcomes) {
    for (var j = 0; j < entry.outcomes.length; j++) {
      var o = entry.outcomes[j];
      html += '<div class="tier ' + tierClass(o.tier) + '"><div class="tier-label">' + esc(tierLabel(o.tier)) + '</div><div class="field-value">' + md(cap(o.content)) + '</div></div>';
    }
  }
  return html;
};

RENDERERS['playbooks'] = function(entry) {
  var html = '<div class="field"><div class="field-label">Category</div><div class="field-value stat">' + esc(entry.category) + '</div></div>';
  html += '<div class="field"><div class="field-label">Tagline</div><div class="field-value"><em>' + esc(entry.tagline) + '</em></div></div>';
  html += '<details class="flavor"><summary>What Are You?</summary><div class="field-value">' + md(entry.whatAreYou) + '</div></details>';
  html += fieldHtml('Disciplines', entry.disciplines);
  html += '<div class="tier flaw"><div class="tier-label">Bane: <em>' + esc(entry.baneName) + '</em></div><div class="field-value">' + md(entry.baneDescription) + '</div></div>';
  html += '<div class="tier compulsion"><div class="tier-label">Compulsion: <em>' + esc(entry.compulsionName || 'Nothing') + '</em></div><div class="field-value">' + md(entry.compulsionDescription) + '</div></div>';
  html += '<div class="field"><div class="field-label">Perks (' + entry.perks.length + ')</div>';
  for (var i = 0; i < entry.perks.length; i++) {
    var p = entry.perks[i];
    html += '<div class="tier tier-10"><div class="tier-label">' + esc(p.name) + '</div><div class="field-value">' + md(p.description) + '</div></div>';
  }
  html += '</div>';
  html += '<div class="field"><div class="field-label">XP Triggers</div><div class="field-value"><p>Once each per session, gain +1 XP when you...</p><ul>';
  for (var j = 0; j < entry.xpTriggers.length; j++) {
    html += '<li>' + md(entry.xpTriggers[j]) + '</li>';
  }
  html += '</ul></div></div>';
  if (entry.xpExtra) {
    html += '<details class="flavor"><summary>Special Rules</summary><div class="field-value">' + md(entry.xpExtra) + '</div></details>';
  }
  html += '<div class="field"><div class="field-label">Archetypes</div>';
  for (var a = 0; a < entry.archetypes.length; a++) {
    var arch = entry.archetypes[a];
    html += '<div class="tier"><div class="tier-label">' + esc(arch.name) + '</div><div class="field-value"><em>' + esc(arch.tagline) + '</em><br>' + esc(arch.stats) + '</div></div>';
  }
  html += '<div class="tier"><div class="tier-label">Custom</div><div class="field-value">' + esc(entry.customStatSpread) + '</div></div>';
  html += '</div>';
  return html;
};

RENDERERS['disciplines'] = function(entry) {
  var html = '';
  if (entry.status === 'stub') {
    html += '<div class="field"><div class="field-value" style="color:var(--text-muted);font-style:italic">Not yet written</div></div>';
    return html;
  }
  if (entry.intro) {
    html += '<details class="flavor"><summary>Introduction</summary><div class="field-value">' + md(entry.intro) + '</div></details>';
  }
  if (entry.perk) {
    html += '<div class="tier tier-12"><div class="tier-label">Perk: ' + esc(entry.perk.name) + '</div><div class="field-value">' + md(entry.perk.body) + '</div></div>';
  }
  for (var i = 0; i < entry.powers.length; i++) {
    var p = entry.powers[i];
    var tags = p.tags.length > 0 ? ' <span class="badge">' + esc(p.tags.join(', ')) + '</span>' : '';
    html += '<div class="tier lvl-' + p.level + '"><div class="tier-label">L' + p.level + ': ' + esc(p.name) + tags + '</div><div class="field-value">' + mdColorTiers(p.body) + '</div></div>';
  }
  return html;
};

RENDERERS['coterie-types'] = function(entry) {
  var html = '<details class="flavor"><summary>Description</summary><div class="field-value">' + md(entry.description) + '</div></details>';
  html += '<div class="field"><div class="field-label">Haven Stats</div><div class="stat-bar">';
  var parts = entry.havenStats.split('|');
  for (var i = 0; i < parts.length; i++) {
    var chunk = parts[i].trim();
    var m = chunk.match(/^(.+?)\\s+([+\\-\\u2212]\\d+)$/);
    if (m) {
      html += '<span class="stat-chip"><strong>' + esc(m[1]) + '</strong> ' + esc(m[2]) + '</span>';
    } else {
      html += '<span class="stat-chip">' + esc(chunk) + '</span>';
    }
  }
  html += '</div></div>';
  var feat = entry.havenFeatures;
  html += '<div class="tier merit"><div class="tier-label">Positive Features</div><div class="pick-count">Pick ' + feat.positiveCount + '</div><ul class="feature-list">';
  for (var p = 0; p < feat.positiveOptions.length; p++) {
    html += '<li>' + esc(cap(feat.positiveOptions[p])) + '</li>';
  }
  html += '</ul></div>';
  html += '<div class="tier flaw"><div class="tier-label">Negative Features</div><div class="pick-count">Pick ' + feat.negativeCount + '</div><ul class="feature-list">';
  for (var n = 0; n < feat.negativeOptions.length; n++) {
    html += '<li>' + esc(cap(feat.negativeOptions[n])) + '</li>';
  }
  html += '</ul></div>';
  return html;
};

RENDERERS['coterie-moves'] = function(entry) {
  var html = fieldHtml('Trigger', '**' + entry.trigger + '**');
  html += fieldHtml('Count Rule', entry.countRule);
  var groupClasses = {
    'Everyone rolls 10+': 'group-all',
    'Half or more succeed': 'group-half',
    'Less than half succeed': 'group-less',
    'Nobody succeeds': 'group-none'
  };
  for (var i = 0; i < entry.tiers.length; i++) {
    var t = entry.tiers[i];
    var cls = groupClasses[t.tier] || '';
    html += '<div class="tier ' + cls + '"><div class="tier-label">' + esc(t.tier) + '</div><div class="field-value">' + md(t.description) + '</div></div>';
  }
  if (entry.holdOptions) {
    html += '<div class="hold-list"><div class="field-label">Spend Hold 1-for-1</div><ul>';
    for (var h = 0; h < entry.holdOptions.length; h++) {
      html += '<li>' + md(entry.holdOptions[h]) + '</li>';
    }
    html += '</ul></div>';
  }
  return html;
};

var REF_RENDERERS = {};

REF_RENDERERS['stat-ref-tables'] = function(data) {
  var html = '';
  var statColors = ['#2e7d32', '#e65100', '#c62828', '#b8860b', '#6a5acd'];
  for (var i = 0; i < data.tables.length; i++) {
    var tbl = data.tables[i];
    var col = statColors[i] || 'var(--accent)';
    html += '<div class="field"><div class="field-label" style="color:' + col + ';font-size:0.85rem">' + esc(tbl.name) + '</div>';
    for (var r = 0; r < tbl.rows.length; r++) {
      var row = tbl.rows[r];
      var score = parseInt(row.score, 10);
      var rowCol = score < 0 ? '#ef5350' : (score > 0 ? '#66bb6a' : 'var(--text-muted)');
      html += '<div class="tier" style="border-left-color:' + rowCol + ';padding:0.4rem 0.75rem"><div class="tier-label" style="color:' + rowCol + ';font-size:0.8rem">' + esc(row.score) + '</div><div class="field-value" style="font-size:0.85rem">' + esc(row.description) + '</div></div>';
    }
    html += '</div>';
  }
  return html;
};

REF_RENDERERS['harm-healing'] = function(data) {
  var html = '<details class="flavor"><summary>Overview</summary><div class="field-value">' + md(data.intro) + '</div></details>';
  html += '<div class="field"><div class="field-label">HP by Blood Potency</div><div class="stat-bar">';
  for (var i = 0; i < data.hpTiers.length; i++) {
    var t = data.hpTiers[i];
    html += '<span class="stat-chip"><strong>BP ' + esc(t.bpRange) + ':</strong> ' + t.hp + ' HP</span>';
  }
  html += '</div></div>';
  for (var e = 0; e < data.equipTables.length; e++) {
    var etbl = data.equipTables[e];
    var isWeapon = etbl.name.toLowerCase().indexOf('weapon') >= 0;
    html += '<div class="field"><div class="field-label">' + esc(etbl.name) + '</div>';
    for (var r = 0; r < etbl.rows.length; r++) {
      var row = etbl.rows[r];
      var val = row.value;
      var isAgg = val.toLowerCase().includes('aggravated');
      if (isWeapon) {
        if (isAgg) val = val + ' Harm';
        else if (/^[\\d\\u2013-]+$/.test(val.trim())) val = val.trim() + '-Harm';
      } else {
        if (val.trim() !== 'Varies' && /^[\\d\\u2013-]+$/.test(val.trim())) val = val.trim() + '-Armor';
      }
      var eCol = isAgg ? '#c62828' : 'var(--accent)';
      html += '<div class="tier" style="border-left-color:' + eCol + ';padding:0.4rem 0.75rem"><div class="tier-label" style="color:' + eCol + '">' + esc(val) + '</div><div class="field-value" style="font-size:0.85rem">' + md(row.item) + '</div></div>';
    }
    html += '</div>';
  }
  for (var s = 0; s < data.sections.length; s++) {
    html += '<details class="flavor"><summary>' + esc(data.sections[s].name) + '</summary><div class="field-value">' + mdColorTiers(data.sections[s].body) + '</div></details>';
  }
  return html;
};

REF_RENDERERS['optional-extras'] = function(data) {
  var html = '<div class="field"><div class="field-value">' + md(data.clanBaneVariantsIntro) + '</div></div>';
  html += '<div class="field"><div class="field-label">Clan Bane Variants (14)</div>';
  for (var i = 0; i < data.clanBaneVariants.length; i++) {
    var v = data.clanBaneVariants[i];
    html += '<div class="tier flaw"><div class="tier-label">' + esc(v.clan) + ': <em>' + esc(v.baneName) + '</em></div><div class="field-value">' + md(v.consequences) + '</div></div>';
  }
  html += '</div>';
  html += '<div class="field"><div class="field-value">' + md(data.folkloricBanesIntro) + '</div></div>';
  html += '<div class="field"><div class="field-label">Folkloric Banes (10)</div>';
  for (var f = 0; f < data.folkloricBanes.length; f++) {
    var b = data.folkloricBanes[f];
    html += '<div class="tier flaw"><div class="tier-label" style="display:flex;justify-content:space-between;align-items:center"><em>' + esc(b.baneName) + '</em><span class="badge">' + esc(b.xpGain) + '</span></div><div class="field-value">' + md(b.consequences) + '</div></div>';
  }
  html += '</div>';
  return html;
};

REF_RENDERERS['coterie-stats'] = function(data) {
  var html = '<details class="flavor"><summary>Overview</summary><div class="field-value">' + md(data.intro) + '</div></details>';
  var statColors = ['#c62828', '#6a5acd', '#b8860b', '#2e7d32', '#e65100'];
  for (var i = 0; i < data.stats.length; i++) {
    var s = data.stats[i];
    var col = statColors[i] || 'var(--accent)';
    html += '<div class="tier" style="border-left-color:' + col + '"><div class="tier-label" style="color:' + col + '">' + esc(s.name) + '</div>';
    html += '<div class="field-value">' + md(s.description) + '</div>';
    if (s.mechanic) html += '<div class="field" style="margin-top:0.5rem"><div class="field-label">Mechanic</div><div class="field-value">' + md(s.mechanic) + '</div></div>';
    html += '<div class="field" style="margin-top:0.35rem"><div class="field-label">Changes Through</div><div class="field-value" style="font-size:0.85rem">' + esc(s.changesThrough) + '</div></div>';
    html += '</div>';
  }
  return html;
};

REF_RENDERERS['blood-potency'] = function(data) {
  var html = '<details class="flavor"><summary>Overview</summary><div class="field-value">' + md(data.intro) + '</div></details>';
  html += '<div class="field"><div class="field-label">Starting BP by Age</div><div class="field-value" style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-top:0.25rem">';
  for (var i = 0; i < data.ageScaling.length; i++) {
    var a = data.ageScaling[i];
    html += '<span><strong>' + esc(a.label) + ':</strong> BP ' + a.bp + '</span>';
  }
  html += '</div></div>';
  html += '<div class="field"><div class="field-label">Feeding Restrictions by BP</div>';
  var bpColors = ['#2e7d32', '#2e7d32', '#6d8700', '#e65100', '#c62828', '#c62828'];
  for (var f = 0; f < data.feedingRestrictions.length; f++) {
    var fr = data.feedingRestrictions[f];
    var col = bpColors[f] || 'var(--accent)';
    html += '<div class="tier" style="border-left-color:' + col + '"><div class="tier-label" style="color:' + col + '">BP ' + esc(fr.bpRange) + '</div><div class="field-value">' + md(fr.description) + '</div></div>';
  }
  html += '</div>';
  for (var e = 0; e < data.effects.length; e++) {
    html += '<details class="flavor"><summary>' + esc(data.effects[e].name) + '</summary><div class="field-value">' + md(data.effects[e].body) + '</div></details>';
  }
  return html;
};

REF_RENDERERS['humanity'] = function(data) {
  var html = '<details class="flavor"><summary>Overview</summary><div class="field-value">' + md(data.intro) + '</div></details>';
  html += '<div class="field"><div class="field-label">Low Humanity Consequences</div>';
  var humColors = ['#2e7d32', '#6d8700', '#b8860b', '#cc6600', '#c62828', '#9b1b30', '#6a0dad'];
  for (var i = 0; i < data.tiers.length; i++) {
    var t = data.tiers[i];
    var lbl = 'Humanity ' + t.range + (t.label ? ': ' + t.label : '');
    var col = humColors[i] || 'var(--accent)';
    html += '<div class="tier" style="border-left-color:' + col + '"><div class="tier-label" style="color:' + col + '">' + esc(lbl) + '</div><div class="field-value">' + md(t.description) + '</div></div>';
  }
  html += '</div>';
  for (var s = 0; s < data.sections.length; s++) {
    html += '<details class="flavor"><summary>' + esc(data.sections[s].name) + '</summary><div class="field-value">' + md(data.sections[s].body) + '</div></details>';
  }
  return html;
};

REF_RENDERERS['hunger'] = function(data) {
  var html = '<div class="field"><div class="field-value">' + md(data.intro) + '</div></div>';
  html += '<div class="field"><div class="field-label">Hunger Tiers</div>';
  var hungerColors = ['#2e7d32', '#2e7d32', '#e65100', '#c62828', '#c62828'];
  for (var i = 0; i < data.tiers.length; i++) {
    var t = data.tiers[i];
    var col = hungerColors[i] || 'var(--accent)';
    html += '<div class="tier" style="border-left-color:' + col + '"><div class="tier-label" style="color:' + col + '">' + esc(t.level + ' — ' + t.label) + '</div><div class="field-value">' + md(t.description) + '</div></div>';
  }
  html += '</div>';
  for (var s = 0; s < data.sections.length; s++) {
    html += '<details class="flavor"><summary>' + esc(data.sections[s].name) + '</summary><div class="field-value">' + md(data.sections[s].body) + '</div></details>';
  }
  return html;
};

REF_RENDERERS['advancement'] = function(data) {
  var html = '<div class="field"><div class="field-value">' + md(data.intro) + '</div></div>';
  html += '<div class="field"><div class="field-label">XP Sources</div>';
  for (var i = 0; i < data.xpSources.length; i++) {
    var src = data.xpSources[i];
    html += '<div class="tier tier-10"><div class="tier-label">' + esc(src.name) + ' <span class="badge">max: ' + esc(src.maxPerSession) + '</span></div><div class="field-value">' + md(src.description) + '</div></div>';
  }
  html += '</div>';
  html += '<div class="field"><div class="field-label">XP Costs</div>';
  for (var c = 0; c < data.xpCosts.length; c++) {
    var cost = data.xpCosts[c];
    html += '<div class="tier"><div class="tier-label">' + esc(cost.name) + '</div><div class="field-value">' + md(cost.description) + '</div></div>';
  }
  html += '</div>';
  return html;
};

function defaultRenderer(entry) {
  var html = '';
  var keys = Object.keys(entry);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key === 'name' || key === 'type') continue;
    var val = entry[key];
    if (typeof val === 'object' && val !== null) {
      html += fieldHtml(key, '<pre style="white-space:pre-wrap;font-size:0.8rem">' + esc(JSON.stringify(val, null, 2)) + '</pre>', { raw: true });
    } else {
      html += fieldHtml(key, val);
    }
  }
  return html;
}

function badge(entry, key) {
  if (key === 'predator-types') {
    var parts = [];
    if (entry.huntingStat) parts.push(entry.huntingStat);
    if (entry.discipline) parts.push(entry.discipline);
    return parts.join(' / ');
  }
  if (key === 'age-brackets') return 'BP ' + entry.startingBloodPotency;
  if (key === 'basic-moves') {
    if (entry.type === 'blush-of-life') return 'Special';
    return entry.rollStat || '';
  }
  if (key === 'playbooks') return entry.category;
  if (key === 'disciplines') return entry.status + ' (' + entry.powers.length + ' powers)';
  if (key === 'coterie-types') return entry.havenStats;
  if (key === 'coterie-moves') return entry.holdOptions ? 'Hold' : '';
  return '';
}

var DISPLAY_NAMES = { 'harm-healing': 'Harm & Healing' };
function prettifyKey(key) {
  if (DISPLAY_NAMES[key]) return DISPLAY_NAMES[key];
  return key.split('-').map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
}

function renderRefData(key) {
  var dataset = DATA[key];
  if (!dataset || !dataset.data) return;
  var render = REF_RENDERERS[key];
  if (!render) return;

  document.querySelectorAll('nav button').forEach(function(b) {
    b.classList.toggle('active', b.dataset.key === key);
  });

  var main = document.getElementById('content');
  main.textContent = '';

  var h2 = document.createElement('h2');
  h2.textContent = prettifyKey(key);
  main.appendChild(h2);

  var sub = document.createElement('div');
  sub.className = 'subtitle';
  sub.textContent = 'Reference data \\u00b7 generated ' + new Date(dataset.generatedAt).toLocaleString();
  main.appendChild(sub);

  var container = document.createElement('div');
  container.innerHTML = render(dataset.data);
  main.appendChild(container);
}

function renderDataset(key) {
  var dataset = DATA[key];
  if (!dataset) return;

  if (dataset.data && !dataset.entries) {
    renderRefData(key);
    return;
  }

  var entries = dataset.entries;
  if (!entries) return;
  var render = RENDERERS[key] || defaultRenderer;

  document.querySelectorAll('nav button').forEach(function(b) {
    b.classList.toggle('active', b.dataset.key === key);
  });

  var main = document.getElementById('content');
  main.textContent = '';

  var h2 = document.createElement('h2');
  h2.textContent = prettifyKey(key);
  main.appendChild(h2);

  var sub = document.createElement('div');
  sub.className = 'subtitle';
  sub.textContent = entries.length + ' entries \\u00b7 generated ' + new Date(dataset.generatedAt).toLocaleString();
  main.appendChild(sub);

  var search = document.createElement('input');
  search.className = 'search-box';
  search.placeholder = 'Filter ' + prettifyKey(key).toLowerCase() + '...';
  main.appendChild(search);

  var container = document.createElement('div');
  container.id = 'cards';
  main.appendChild(container);

  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var name = e.name || ('Entry ' + (i + 1));
    var b = badge(e, key);

    var card = document.createElement('div');
    card.className = 'card';
    card.dataset.name = name.toLowerCase();

    var header = document.createElement('div');
    header.className = 'card-header';
    header.onclick = (function(c) { return function() { c.classList.toggle('open'); }; })(card);

    var h3 = document.createElement('h3');
    h3.textContent = name;
    header.appendChild(h3);

    if (b) {
      var bdg = document.createElement('span');
      bdg.className = 'badge';
      bdg.textContent = b;
      header.appendChild(bdg);
    }

    card.appendChild(header);

    var body = document.createElement('div');
    body.className = 'card-body';
    body.innerHTML = render(e);
    card.appendChild(body);

    container.appendChild(card);
  }

  search.addEventListener('input', function() {
    var q = this.value.toLowerCase();
    container.querySelectorAll('.card').forEach(function(card) {
      card.classList.toggle('hidden', q.length > 0 && card.dataset.name.indexOf(q) === -1);
    });
  });
  search.focus();
}

var navEl = document.getElementById('nav-buttons');
var keys = Object.keys(DATA);
for (var k = 0; k < keys.length; k++) {
  (function(key) {
    var count = DATA[key].entries ? DATA[key].entries.length : (DATA[key].data ? 'ref' : '?');
    var btn = document.createElement('button');
    btn.dataset.key = key;
    btn.textContent = prettifyKey(key) + ' (' + count + ')';
    btn.onclick = function() { renderDataset(key); };
    navEl.appendChild(btn);
  })(keys[k]);
}

var meta = document.getElementById('gen-meta');
var first = DATA[keys[0]];
if (first && first.generatedAt) {
  meta.textContent = 'Generated: ' + new Date(first.generatedAt).toLocaleDateString();
}

if (keys.length > 0) renderDataset(keys[0]);
<\/script>
</body>
</html>`;

writeFileSync(OUT_FILE, html, 'utf-8');
console.log('Wrote ' + OUT_FILE);
console.log('Embedded ' + files.length + ' datasets: ' + files.join(', '));
console.log('Open the file in a browser to view.');
