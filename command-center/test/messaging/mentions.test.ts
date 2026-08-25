import { describe, expect, it } from 'vitest';
import { parseMentions } from '../../src/messaging/mentions.js';

describe('parseMentions', () => {
  it('extracts and lowercases mentions', () => {
    expect(parseMentions('hey @Jonathan can you look at this')).toEqual(['jonathan']);
  });

  it('deduplicates repeated mentions', () => {
    expect(parseMentions('@sam @sam are you there')).toEqual(['sam']);
  });

  it('returns an empty array when there are no mentions', () => {
    expect(parseMentions('no mentions here')).toEqual([]);
  });

  it('handles multiple distinct mentions in order of first appearance', () => {
    expect(parseMentions('@alice and @bob and @alice again')).toEqual(['alice', 'bob']);
  });

  it('allows dots/underscores/hyphens in handles', () => {
    expect(parseMentions('@jane.doe @a_b @c-d')).toEqual(['jane.doe', 'a_b', 'c-d']);
  });
});
