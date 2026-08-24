import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  loadKbGrounding,
  VERTICAL_BASE_FILES,
  NICHE_OVERLAY_FILES,
} from '../../src/unifiedKb/kbLibrary.js';
import { parseNicheAtlas } from '../../src/kb/atlasParser.js';
import { readFileSync } from 'node:fs';

const kbSourceDir = path.join(import.meta.dirname, '..', '..', 'kb-source');
const atlas = parseNicheAtlas(readFileSync(path.join(kbSourceDir, 'niche-atlas.md'), 'utf8'));

describe('loadKbGrounding', () => {
  it('loads a vertical base layer and its matching niche overlay when both exist', () => {
    const grounding = loadKbGrounding(kbSourceDir, 'Automotive', 'Auto repair / mechanic');
    expect(grounding.verticalBase).toContain('## 0.');
    expect(grounding.nicheOverlay).toBeDefined();
    expect(grounding.nicheOverlay).toContain('## A');
  });

  it('loads a vertical base layer with no overlay when the niche has none', () => {
    const grounding = loadKbGrounding(kbSourceDir, 'Automotive', 'Some niche with no overlay file');
    expect(grounding.verticalBase).toContain('## 0.');
    expect(grounding.nicheOverlay).toBeUndefined();
  });

  it('returns an empty object, not an error, for a vertical with no pre-written base layer', () => {
    const grounding = loadKbGrounding(kbSourceDir, 'Funeral & Memorial', 'Any niche');
    expect(grounding).toEqual({});
  });

  it('never sets nicheOverlay without verticalBase also being set', () => {
    for (const vertical of Object.keys(NICHE_OVERLAY_FILES)) {
      for (const niche of Object.keys(NICHE_OVERLAY_FILES[vertical])) {
        const grounding = loadKbGrounding(kbSourceDir, vertical, niche);
        if (grounding.nicheOverlay) expect(grounding.verticalBase).toBeDefined();
      }
    }
  });

  it('has a base-layer file entry for every vertical actually in the atlas', () => {
    const benchVerticals = ['Funeral & Memorial', 'Moving & Storage', 'Education/Childcare', 'Logistics & Trucking'];
    const nonBenchVerticals = atlas.verticals
      .map((v) => v.name)
      .filter((name) => !benchVerticals.includes(name));
    for (const name of nonBenchVerticals) {
      expect(VERTICAL_BASE_FILES[name], `expected a base-layer file mapped for "${name}"`).toBeDefined();
    }
  });

  it('every mapped base-layer and overlay file actually exists and loads real content', () => {
    for (const [vertical, file] of Object.entries(VERTICAL_BASE_FILES)) {
      const grounding = loadKbGrounding(kbSourceDir, vertical, '__no_such_niche__');
      expect(grounding.verticalBase, `${vertical} -> ${file} should have loaded`).toBeTruthy();
    }
    for (const [vertical, niches] of Object.entries(NICHE_OVERLAY_FILES)) {
      for (const [niche, file] of Object.entries(niches)) {
        const grounding = loadKbGrounding(kbSourceDir, vertical, niche);
        expect(grounding.nicheOverlay, `${vertical} / ${niche} -> ${file} should have loaded`).toBeTruthy();
      }
    }
  });
});
