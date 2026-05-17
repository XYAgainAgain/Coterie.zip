#!/usr/bin/env tsx
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from './common/io.js';
import { parseAgeBrackets } from './parsers/age-brackets.js';
import { parsePredatorTypes } from './parsers/predator-types.js';
import { parseBasicMoves } from './parsers/basic-moves.js';
import { parsePlaybooks } from './parsers/playbooks.js';
import { parseDisciplines } from './parsers/disciplines.js';
import { parseBloodPotency } from './parsers/blood-potency.js';
import { parseHumanity } from './parsers/humanity.js';
import { parseHunger } from './parsers/hunger.js';
import { parseAdvancement } from './parsers/advancement.js';
import { parseCoterieStats } from './parsers/coterie-stats.js';
import { parseCoterieTypes } from './parsers/coterie-types.js';
import { parseCoterieMoves } from './parsers/coterie-moves.js';
import { parseStatRefTables } from './parsers/stat-ref-tables.js';
import { parseHarmHealing } from './parsers/harm-healing.js';
import { parseOptionalExtras } from './parsers/optional-extras.js';
import { parseSnippets } from './parsers/snippets.js';
import { AgeBracketsFileSchema } from './schemas/age-brackets.js';
import { PredatorTypesFileSchema } from './schemas/predator-types.js';
import { BasicMovesFileSchema } from './schemas/basic-moves.js';
import { PlaybooksFileSchema } from './schemas/playbooks.js';
import { DisciplinesFileSchema } from './schemas/disciplines.js';
import { BloodPotencyFileSchema } from './schemas/blood-potency.js';
import { HumanityFileSchema } from './schemas/humanity.js';
import { HungerFileSchema } from './schemas/hunger.js';
import { AdvancementFileSchema } from './schemas/advancement.js';
import { CoterieStatsFileSchema } from './schemas/coterie-stats.js';
import { CoterieTypesFileSchema } from './schemas/coterie-types.js';
import { CoterieMovesFileSchema } from './schemas/coterie-moves.js';
import { StatRefTablesFileSchema } from './schemas/stat-ref-tables.js';
import { HarmHealingFileSchema } from './schemas/harm-healing.js';
import { OptionalExtrasFileSchema } from './schemas/optional-extras.js';
import { SnippetsFileSchema } from './schemas/snippets.js';
import type { ZodType } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const OUTPUT_DIR = resolve(REPO_ROOT, 'vamp/public/data');

interface EntryTask {
  name: string;
  kind: 'entries';
  parse: () => unknown[];
  schema: ZodType;
  outputFile: string;
}

interface DataTask {
  name: string;
  kind: 'data';
  parse: () => unknown;
  schema: ZodType;
  outputFile: string;
}

type ParserTask = EntryTask | DataTask;

const tasks: ParserTask[] = [
  {
    name: 'Age Brackets',
    kind: 'entries',
    parse: () => parseAgeBrackets(REPO_ROOT),
    schema: AgeBracketsFileSchema,
    outputFile: 'age-brackets.json',
  },
  {
    name: 'Predator Types',
    kind: 'entries',
    parse: () => parsePredatorTypes(REPO_ROOT),
    schema: PredatorTypesFileSchema,
    outputFile: 'predator-types.json',
  },
  {
    name: 'Basic Moves',
    kind: 'entries',
    parse: () => parseBasicMoves(REPO_ROOT),
    schema: BasicMovesFileSchema,
    outputFile: 'basic-moves.json',
  },
  {
    name: 'Playbooks',
    kind: 'entries',
    parse: () => parsePlaybooks(REPO_ROOT),
    schema: PlaybooksFileSchema,
    outputFile: 'playbooks.json',
  },
  {
    name: 'Disciplines',
    kind: 'entries',
    parse: () => parseDisciplines(REPO_ROOT),
    schema: DisciplinesFileSchema,
    outputFile: 'disciplines.json',
  },
  {
    name: 'Blood Potency',
    kind: 'data',
    parse: () => parseBloodPotency(REPO_ROOT),
    schema: BloodPotencyFileSchema,
    outputFile: 'blood-potency.json',
  },
  {
    name: 'Humanity',
    kind: 'data',
    parse: () => parseHumanity(REPO_ROOT),
    schema: HumanityFileSchema,
    outputFile: 'humanity.json',
  },
  {
    name: 'Hunger',
    kind: 'data',
    parse: () => parseHunger(REPO_ROOT),
    schema: HungerFileSchema,
    outputFile: 'hunger.json',
  },
  {
    name: 'Advancement',
    kind: 'data',
    parse: () => parseAdvancement(REPO_ROOT),
    schema: AdvancementFileSchema,
    outputFile: 'advancement.json',
  },
  {
    name: 'Coterie Stats',
    kind: 'data',
    parse: () => parseCoterieStats(REPO_ROOT),
    schema: CoterieStatsFileSchema,
    outputFile: 'coterie-stats.json',
  },
  {
    name: 'Coterie Types',
    kind: 'entries',
    parse: () => parseCoterieTypes(REPO_ROOT),
    schema: CoterieTypesFileSchema,
    outputFile: 'coterie-types.json',
  },
  {
    name: 'Coterie Moves',
    kind: 'entries',
    parse: () => parseCoterieMoves(REPO_ROOT),
    schema: CoterieMovesFileSchema,
    outputFile: 'coterie-moves.json',
  },
  {
    name: 'Stat Reference Tables',
    kind: 'data',
    parse: () => parseStatRefTables(REPO_ROOT),
    schema: StatRefTablesFileSchema,
    outputFile: 'stat-ref-tables.json',
  },
  {
    name: 'Harm & Healing',
    kind: 'data',
    parse: () => parseHarmHealing(REPO_ROOT),
    schema: HarmHealingFileSchema,
    outputFile: 'harm-healing.json',
  },
  {
    name: 'Optional Extras',
    kind: 'data',
    parse: () => parseOptionalExtras(REPO_ROOT),
    schema: OptionalExtrasFileSchema,
    outputFile: 'optional-extras.json',
  },
  {
    name: 'Snippets',
    kind: 'entries',
    parse: () => parseSnippets(REPO_ROOT),
    schema: SnippetsFileSchema,
    outputFile: 'snippets.json',
  },
];

let failures = 0;
const now = new Date().toISOString();

for (const task of tasks) {
  const label = `[${task.name}]`;
  try {
    console.log(`${label} Parsing...`);
    const result = task.parse();

    if (task.kind === 'entries') {
      const entries = result as unknown[];
      console.log(`${label} Found ${entries.length} entries`);
      const fileData = { version: 1 as const, generatedAt: now, entries };
      console.log(`${label} Validating...`);
      task.schema.parse(fileData);
      const outPath = resolve(OUTPUT_DIR, task.outputFile);
      writeJson(outPath, fileData);
      console.log(`${label} Wrote ${outPath}`);
    } else {
      console.log(`${label} Parsed reference data`);
      const fileData = { version: 1 as const, generatedAt: now, data: result };
      console.log(`${label} Validating...`);
      task.schema.parse(fileData);
      const outPath = resolve(OUTPUT_DIR, task.outputFile);
      writeJson(outPath, fileData);
      console.log(`${label} Wrote ${outPath}`);
    }
  } catch (err) {
    failures++;
    console.error(`${label} FAILED:`, err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
  }
}

console.log(`\n${tasks.length - failures}/${tasks.length} parsers succeeded.`);
if (failures > 0) {
  process.exit(1);
}
