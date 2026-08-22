/** A single niche entry inside a vertical's atlas section. */
export interface AtlasNiche {
  name: string;
  /** Full detail text after the niche name (intent/intake/urgency/notes), or null for
   * verticals (currently only Law Firms) that list niche names inline without detail. */
  detail: string | null;
}

/** One vertical entry parsed from niche-atlas.md. */
export interface AtlasVertical {
  number: number;
  name: string;
  /** Present when the atlas header calls out a worked example, e.g. "(gold-standard worked example: `verticals/law-firms.md`)". */
  workedExampleNote: string | null;
  positioning: string;
  register: string;
  compliance: string;
  niches: AtlasNiche[];
  emergencyHandoff: string;
}

export interface NicheAtlas {
  verticals: AtlasVertical[];
  /** Verticals named in the atlas footer as attaching "the same way" but without their own
   * section yet (e.g. Funeral & Memorial) — tracked so callers know they're not fully specified. */
  benchVerticals: string[];
}

/** The kb-template.md section numbers, 0-14, and which are non-negotiable per the template's own rules. */
export const KB_TEMPLATE_SECTIONS = [
  '0. How to use this KB',
  '1. Positioning & promise',
  '2. Persona & voice',
  '3. Language & dialect',
  '4. Intent map',
  '5. COMPLIANCE GUARDRAILS',
  '6. Intake & qualification',
  '7. FAQ bank (EN/ES)',
  '8. Booking & scheduling',
  '9. Data schema',
  '10. Objection & sensitive',
  '11. Human-handoff triggers',
  '12. Website copy blocks (EN/ES)',
  '13. Chatbot quick-replies',
  '14. Niche tree / overlays',
] as const;

export const REQUIRED_SECTION_NUMBERS = [5, 9] as const;

export interface KbDocSection {
  number: number;
  title: string;
  body: string;
}

export interface KbDoc {
  /** The H1 title line(s) and any blockquote preamble before the first "## N." section. */
  preamble: string;
  sections: KbDocSection[];
}

export interface KbDocValidation {
  ok: boolean;
  missingSections: number[];
  missingRequiredSections: number[];
}
