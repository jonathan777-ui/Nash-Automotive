import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseNicheAtlas } from '../../src/kb/atlasParser.js';
import { renderVerticalForPrompt } from '../../src/unifiedKb/renderVertical.js';

const atlasPath = path.join(import.meta.dirname, '..', '..', 'kb-source', 'niche-atlas.md');
const atlas = parseNicheAtlas(readFileSync(atlasPath, 'utf8'));

describe('renderVerticalForPrompt', () => {
  it('reconstructs a bulleted-niche vertical (with per-niche detail) back into prompt text', () => {
    const homeServices = atlas.verticals.find((v) => v.name === 'Home Services')!;
    const text = renderVerticalForPrompt(homeServices);
    expect(text).toContain('## Home Services');
    expect(text).toContain('**Positioning:**');
    expect(text).toContain('- *HVAC* — intent: no heat/AC');
  });

  it('reconstructs the Law Firms inline-list vertical without inventing per-niche detail', () => {
    const lawFirms = atlas.verticals.find((v) => v.name === 'Law Firms')!;
    const text = renderVerticalForPrompt(lawFirms);
    expect(text).toContain('- Personal Injury');
    expect(text).not.toContain('*Personal Injury*'); // no detail to bold-italicize for this vertical
  });
});
