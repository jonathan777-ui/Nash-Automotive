import type { NicheAtlas } from '../kb/types.js';
import type { CompanyProfile } from '../company/types.js';

export interface ManualFormInput {
  /** The brief's own field list for this fallback step is just "City, State, niche selection" —
   * no company name. That can't be right for a Company Profile (every other cascade step
   * produces a real business name, and the demo needs one to introduce itself as), so this adds
   * it rather than silently inventing a placeholder like "HVAC business in Austin, TX" that could
   * be mistaken for something the form actually determined. Flagging this addition here — worth
   * confirming it's an oversight in the brief and not a deliberate omission for some reason not
   * visible from this side. */
  companyName: string;
  city: string;
  state: string;
  vertical: string;
  niche: string;
}

export interface ManualFormSuccess {
  ok: true;
  profile: CompanyProfile;
}
export interface ManualFormFailure {
  ok: false;
  reason: string;
}
export type ManualFormResult = ManualFormSuccess | ManualFormFailure;

/** Cascade step 3 (last resort, per the input cascade's priority order): "short manual form:
 * City, State, niche selection from the KB's niche list." Validates the selected vertical/niche
 * against the actual parsed atlas (checkpoint 1) rather than trusting arbitrary form input, since
 * the whole point of "from the KB's niche list" is that the selection has to be a real one. */
export function buildManualFormProfile(input: ManualFormInput, atlas: NicheAtlas): ManualFormResult {
  const companyName = input.companyName.trim();
  const city = input.city.trim();
  const state = input.state.trim();
  if (!companyName) return { ok: false, reason: 'Company name is required.' };
  if (!city) return { ok: false, reason: 'City is required.' };
  if (!state) return { ok: false, reason: 'State is required.' };

  const vertical = atlas.verticals.find((v) => v.name === input.vertical);
  if (!vertical) {
    return {
      ok: false,
      reason:
        `"${input.vertical}" is not a vertical in the niche atlas. Valid verticals: ` +
        atlas.verticals.map((v) => v.name).join(', '),
    };
  }

  const nicheExists = vertical.niches.some((n) => n.name === input.niche);
  if (!nicheExists) {
    return {
      ok: false,
      reason:
        `"${input.niche}" is not a niche under ${vertical.name}. Valid niches: ` +
        vertical.niches.map((n) => n.name).join(', '),
    };
  }

  return {
    ok: true,
    profile: {
      company: {
        name: companyName,
        address: `${city}, ${state}`,
        primaryType: vertical.name,
        types: [input.niche],
      },
      contact: {},
      background: {
        source: 'manual-form',
        fetchedAt: new Date().toISOString(),
        description: 'No GBP link or website provided — vertical/niche selected manually from the atlas.',
      },
      services: {},
    },
  };
}
