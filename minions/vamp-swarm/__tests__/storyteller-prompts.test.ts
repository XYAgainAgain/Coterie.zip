import { describe, it, expect } from 'vitest';
import { parseBasicMovePrompts, parseStorytellerMoves } from '../parsers/storyteller-prompts.js';

const BASIC_MOVES_FIXTURE = `# Basic Moves

### Discern Vibes

**When you examine a person or social situation**, roll +Wits or +Demeanor (use higher).

**On a 10+,** Hold 3. Spend Hold 1-for-1 to ask these questions:

- Have I met or heard of them before?
- What do they want most right now?

**On a 6-,** you read the situation wrong.

### Catch the Scent

**When you investigate a scene**, roll +Wits or +Blood (use higher).

**On a 10+,** Hold 3. Ask these questions:

- Who or what was here recently?
- What evidence was left behind?
- Are there any lurking dangers?

If you act on the answers, you get +1 Ongoing.

**On a 6-,** you might misread the situation.

### Stay Chill

**When you act while stressed**, roll +Resolve.
`;

describe('parseBasicMovePrompts', () => {
  it('pulls the first question list from each Move section', () => {
    const r = parseBasicMovePrompts(BASIC_MOVES_FIXTURE);
    expect(r.discernVibes).toEqual([
      'Have I met or heard of them before?',
      'What do they want most right now?',
    ]);
    expect(r.catchTheScent).toEqual([
      'Who or what was here recently?',
      'What evidence was left behind?',
      'Are there any lurking dangers?',
    ]);
  });

  it('returns empty arrays when a section is absent (never throws)', () => {
    const r = parseBasicMovePrompts('# Basic Moves\n\n### Stay Chill\n\nroll +Resolve.\n');
    expect(r.discernVibes).toEqual([]);
    expect(r.catchTheScent).toEqual([]);
  });
});

const ST_MOVES_FIXTURE = `# Storyteller Guide

### The Conversation: Revisited

Some earlier H3 that must be ignored.

## Storyteller Moves

Storyteller Moves are the tools you use.

**Soft Moves** are used when:

- Players look to you to see what happens

**Hard Moves** are used when:

- A player rolls 6-

### Build Pressure

**Soft:**

- Reveal signs of approaching danger
- Foreshadow a threat without showing it directly

**Hard:**

- The deadline arrives; consequences happen now

### Exploit Weaknesses

**Soft:**

- Present temptation aligned with their Compulsion

**Hard:**

- Trigger a Compulsion (demand **Stay Chill** roll immediately)
- Use their Bane against them

## Running Combat

### Choosing Who Acts

This H3 is outside the ST Moves section and must not appear.
`;

describe('parseStorytellerMoves', () => {
  it('scopes to the H2 section and splits each category into soft/hard', () => {
    const cats = parseStorytellerMoves(ST_MOVES_FIXTURE);
    expect(cats.map(c => c.category)).toEqual(['Build Pressure', 'Exploit Weaknesses']);
    expect(cats[0]).toEqual({
      category: 'Build Pressure',
      soft: [
        'Reveal signs of approaching danger',
        'Foreshadow a threat without showing it directly',
      ],
      hard: ['The deadline arrives; consequences happen now'],
    });
  });

  it('keeps bold markers in bullet text verbatim', () => {
    const cats = parseStorytellerMoves(ST_MOVES_FIXTURE);
    const exploit = cats.find(c => c.category === 'Exploit Weaknesses')!;
    expect(exploit.hard[0]).toBe('Trigger a Compulsion (demand **Stay Chill** roll immediately)');
  });

  it('ignores the intro lists before the first category', () => {
    const cats = parseStorytellerMoves(ST_MOVES_FIXTURE);
    // "Players look to you..." (intro Soft Moves list) must not land in any category
    expect(cats.some(c => c.soft.includes('Players look to you to see what happens'))).toBe(false);
  });

  it('returns empty when the Storyteller Moves H2 is absent', () => {
    expect(parseStorytellerMoves('# Guide\n\n## Something Else\n\ntext\n')).toEqual([]);
  });
});
