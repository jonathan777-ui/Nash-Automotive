import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseNicheAtlas } from '../../src/kb/atlasParser.js';
import { buildManualFormProfile, type ManualFormInput } from '../../src/manualForm/buildProfile.js';

const atlasPath = path.join(import.meta.dirname, '..', '..', 'kb-source', 'niche-atlas.md');
const atlas = parseNicheAtlas(readFileSync(atlasPath, 'utf8'));

const validInput: ManualFormInput = {
  companyName: 'Joe’s HVAC',
  city: 'Austin',
  state: 'TX',
  vertical: 'Home Services',
  niche: 'HVAC',
};

describe('buildManualFormProfile', () => {
  it('builds a profile for a valid vertical/niche pair against the real atlas', () => {
    const result = buildManualFormProfile(validInput, atlas);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.company.name).toBe('Joe’s HVAC');
    expect(result.profile.company.primaryType).toBe('Home Services');
    expect(result.profile.company.types).toEqual(['HVAC']);
    expect(result.profile.background.source).toBe('manual-form');
  });

  it('rejects a vertical that is not in the atlas', () => {
    const result = buildManualFormProfile({ ...validInput, vertical: 'Not A Real Vertical' }, atlas);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/is not a vertical/);
  });

  it('rejects a niche that is not under the given vertical', () => {
    const result = buildManualFormProfile({ ...validInput, niche: 'Personal Injury' }, atlas);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/is not a niche under Home Services/);
  });

  it('rejects missing required fields', () => {
    expect(buildManualFormProfile({ ...validInput, companyName: '  ' }, atlas).ok).toBe(false);
    expect(buildManualFormProfile({ ...validInput, city: '' }, atlas).ok).toBe(false);
    expect(buildManualFormProfile({ ...validInput, state: '' }, atlas).ok).toBe(false);
  });
});
