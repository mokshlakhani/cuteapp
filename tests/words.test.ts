import { describe, expect, it } from 'vitest';
import { deal, resetDecks } from '../src/core/deck';
import * as slice from '../src/rooms/slice/words';
import * as peel from '../src/rooms/peel/words';
import * as soap from '../src/rooms/soap/words';
import * as stack from '../src/rooms/stack/words';
import * as wrap from '../src/rooms/wrap/words';
import { verdict as sliceVerdict } from '../src/rooms/slice/game';
import { verdict as peelVerdict } from '../src/rooms/peel/game';
import { sayFor } from '../src/rooms/soap/game';
import { verdict as stackVerdict } from '../src/rooms/stack/game';
import { memoryVerdict, scoreMemory } from '../src/rooms/wrap/memory';

const games = { slice, peel, soap, stack, bubbles: wrap } as Record<string, Record<string, readonly string[]>>;

describe('what each game says after a round', () => {
  it('has about fifty lines for every game', () => {
    for (const [name, lists] of Object.entries(games)) {
      const all = Object.values(lists).flat();
      expect(all.length, name).toBeGreaterThanOrEqual(50);
    }
  });

  it('never repeats a line inside a list', () => {
    for (const lists of Object.values(games))
      for (const [name, list] of Object.entries(lists)) expect(new Set(list).size, name).toBe(list.length);
  });

  it('keeps every line short enough to sit on one line on a phone', () => {
    for (const lists of Object.values(games)) for (const list of Object.values(lists)) for (const l of list) expect(l.length, l).toBeLessThanOrEqual(30);
    for (const list of [soap.SOAP_PERFECT, soap.SOAP_CLOSE, soap.SOAP_SMALL, soap.SOAP_BIG]) for (const l of list) expect(l.length, l).toBeLessThanOrEqual(14);
  });

  it('deals every line before any comes round again, never twice running', () => {
    resetDecks();
    const list = slice.SLICE_PERFECT;
    const seen: string[] = [];
    for (let i = 0; i < list.length * 3; i++) seen.push(deal(list));
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    expect(new Set(seen.slice(0, list.length)).size).toBe(list.length);
  });

  it('rotates what each game says, round after round', () => {
    resetDecks();
    const differ = (f: () => string) => {
      const a = f();
      const b = f();
      expect(a).not.toBe(b);
    };
    differ(() => sliceVerdict(8, 8)[0]);
    differ(() => sliceVerdict(9, 8)[0]);
    differ(() => peelVerdict(0)[0]);
    differ(() => peelVerdict(3)[0]);
    differ(() => sayFor('perfect'));
    differ(() => sayFor('too big'));
    differ(() => stackVerdict(9, 9, true)[0]);
    differ(() => stackVerdict(3, 9, false)[0]);
    differ(() => memoryVerdict(scoreMemory([1, 2, 3, 4], [1, 2, 3, 4]), 4)[0]);
    differ(() => memoryVerdict(scoreMemory([1, 2, 3, 4, 5], [9]), 5)[0]);
  });

  it('keeps the facts in the quieter line', () => {
    expect(sliceVerdict(8, 8)[1]).toBe('8 pieces');
    expect(sliceVerdict(10, 8)[1]).toBe('10 pieces · 8 was the plan');
    expect(sliceVerdict(7, 8)[1]).toBe('7 of 8 pieces');
    expect(peelVerdict(1)[1]).toBe('two strips');
    expect(peelVerdict(3)[1]).toMatch(/^4 strips · /);
    expect(memoryVerdict(scoreMemory([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5]), 6)[1]).toBe('5 of 6');
  });
});
