import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseNicheAtlas } from '../src/kb/atlasParser.js';

const atlasPath = path.join(import.meta.dirname, '..', 'kb-source', 'niche-atlas.md');
const source = readFileSync(atlasPath, 'utf8');

describe('parseNicheAtlas', () => {
  const atlas = parseNicheAtlas(source);

  it('parses all 20 verticals in order', () => {
    expect(atlas.verticals).toHaveLength(20);
    expect(atlas.verticals.map((v) => v.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(atlas.verticals[0].name).toBe('Law Firms');
    expect(atlas.verticals[19].name).toBe('Fitness, Studios & Wellness');
  });

  it('captures the worked-example callout on Law Firms only', () => {
    const lawFirms = atlas.verticals[0];
    expect(lawFirms.workedExampleNote).toMatch(/gold-standard worked example/);
    expect(atlas.verticals[1].workedExampleNote).toBeNull();
  });

  it('parses the Law Firms inline middot niche list with no per-niche detail', () => {
    const lawFirms = atlas.verticals[0];
    expect(lawFirms.niches.map((n) => n.name)).toEqual([
      'Personal Injury',
      'Immigration',
      'Family/DV',
      'Criminal Defense',
      "Workers' Comp",
      'Estate & Probate',
      'Business',
      'Real Estate',
      'Bankruptcy',
      'Employment',
    ]);
    expect(lawFirms.niches[0].detail).toBeNull();
  });

  it('parses bulleted niches with full detail text for every other vertical', () => {
    const accounting = atlas.verticals.find((v) => v.name === 'Accounting, Tax & Bookkeeping')!;
    expect(accounting.niches.length).toBeGreaterThan(0);
    const taxPrep = accounting.niches.find((n) => n.name === 'Individual tax prep');
    expect(taxPrep).toBeDefined();
    expect(taxPrep!.detail).toMatch(/intent: file taxes/);
  });

  it('extracts positioning, register, compliance, and emergency/handoff for every vertical', () => {
    for (const v of atlas.verticals) {
      expect(v.positioning, `${v.name} positioning`).not.toBe('');
      expect(v.register, `${v.name} register`).not.toBe('');
      expect(v.compliance, `${v.name} compliance`).not.toBe('');
      expect(v.emergencyHandoff, `${v.name} emergency/handoff`).not.toBe('');
    }
  });

  it('totals 120 real niches across the 20 verticals', () => {
    const total = atlas.verticals.reduce((n, v) => n + v.niches.length, 0);
    expect(total).toBe(120);
  });

  it('lists the 4 bench verticals named in the footer', () => {
    expect(atlas.benchVerticals).toEqual([
      'Funeral & Memorial',
      'Moving & Storage',
      'Education/Childcare',
      'Logistics & Trucking',
    ]);
  });
});
