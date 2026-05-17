import { resolve } from 'node:path';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading, plainText, type Section } from '../common/tokens.js';
import type { BloodPotency } from '../schemas/blood-potency.js';

const SOURCE = 'docs/the-vampiric-condition/blood-potency.md';

function rawContent(tokens: Token[]): string {
  return tokens.map(t => t.raw).join('').trim();
}

function extractIntro(allTokens: Token[]): string {
  const parts: string[] = [];
  for (const t of allTokens) {
    if (t.type === 'heading') break;
    if (t.type === 'space') continue;
    parts.push(t.raw);
  }
  return parts.join('').trim();
}

function parseAgeScaling(section: Section): { label: string; bp: number }[] {
  const results: { label: string; bp: number }[] = [];
  for (const t of section.tokens) {
    if (t.type !== 'list') continue;
    const list = t as Tokens.List;
    for (const item of list.items) {
      const match = item.text.match(/\*\*(.+?):\*\*\s*BP\s+(\d)/);
      if (match) {
        results.push({ label: match[1].trim(), bp: parseInt(match[2], 10) });
      }
    }
    if (results.length > 0) break;
  }
  return results;
}

function parseFeedingRestrictions(section: Section): { bpRange: string; description: string }[] {
  const results: { bpRange: string; description: string }[] = [];
  for (const t of section.tokens) {
    if (t.type !== 'list') continue;
    const list = t as Tokens.List;
    for (const item of list.items) {
      const match = item.text.match(/\*\*BP\s+(.+?):\*\*\s*([\s\S]+)/);
      if (match) {
        results.push({
          bpRange: match[1].trim(),
          description: match[2].trim(),
        });
      }
    }
    if (results.length > 0) break;
  }
  return results;
}

function parseAdvancementPenalties(section: Section): { bpRange: string; penalty: string }[] {
  const results: { bpRange: string; penalty: string }[] = [];
  for (const t of section.tokens) {
    if (t.type !== 'list') continue;
    const list = t as Tokens.List;
    for (const item of list.items) {
      const match = item.text.match(/\*\*BP\s+(.+?):\*\*\s*([\s\S]+)/);
      if (match) {
        results.push({
          bpRange: match[1].trim(),
          penalty: match[2].trim(),
        });
      }
    }
    if (results.length > 0) return results;
  }
  return results;
}

export function parseBloodPotency(repoRoot: string): BloodPotency {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const allTokens = tokenize(src);
  const intro = extractIntro(allTokens);
  const sections = splitByHeading(allTokens, 2);

  const ageSection = sections.find(s => /Age Scaling/i.test(s.name));
  if (!ageSection) throw new Error('[Blood Potency] No Age Scaling section');
  const ageScaling = parseAgeScaling(ageSection);

  const mechSection = sections.find(s => /Mechanical Effects/i.test(s.name));
  if (!mechSection) throw new Error('[Blood Potency] No Mechanical Effects section');

  const h3Sections = splitByH3(mechSection.tokens);

  const feedingSection = h3Sections.find(s => /Feeding Restrictions/i.test(s.name));
  if (!feedingSection) throw new Error('[Blood Potency] No Feeding Restrictions subsection');
  const feedingRestrictions = parseFeedingRestrictions(feedingSection);

  const advSection = h3Sections.find(s => /Advancement Rate/i.test(s.name));
  if (!advSection) throw new Error('[Blood Potency] No Advancement Rate subsection');
  const advancementPenalties = parseAdvancementPenalties(advSection);

  const effects = h3Sections.map(s => ({
    name: s.name,
    body: rawContent(s.tokens),
  })).filter(e => e.body.length > 0);

  return {
    intro,
    ageScaling,
    feedingRestrictions,
    advancementPenalties,
    effects,
  };
}

interface SubSection {
  name: string;
  tokens: Token[];
}

function splitByH3(tokens: Token[]): SubSection[] {
  const sections: SubSection[] = [];
  let current: SubSection | null = null;
  for (const t of tokens) {
    if (t.type === 'heading' && (t as Tokens.Heading).depth === 3) {
      current = { name: plainText(t).trim(), tokens: [] };
      sections.push(current);
    } else if (current) {
      current.tokens.push(t);
    }
  }
  return sections;
}
