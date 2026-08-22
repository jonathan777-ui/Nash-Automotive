import type { CompanyProfile } from '../company/types.js';
import type { KbDoc } from '../kb/types.js';

/** Checkpoint 4's output: "combine whatever the cascade produces with the matching niche KB to
 * populate the Company Profile" + "a Unified KB powering three simultaneous surfaces — AI Voice
 * Receptionist, Chatbot preview, Website preview." */
export interface UnifiedKb {
  companyProfile: CompanyProfile;
  vertical: string;
  niche: string;
  /** The generated KB, parsed into its mandatory §0-14 sections via the same parser checkpoint 1
   * built for reading pre-written KBs (kbDocParser.ts) — reused here to validate what Claude
   * generates, not just what's pulled from kb-source/. Guaranteed to have passed validateKbDoc
   * (§5 Compliance and §9 Data schema present) before a UnifiedKb is ever returned. */
  kbDoc: KbDoc;
  /** The raw generated markdown, kept alongside the parsed doc for surfaces that want the
   * original text rather than re-serializing from kbDoc.sections. */
  rawMarkdown: string;
  /** Fixed bilingual AI-disclaimer — injected here per the brief's standing policy ("This gets
   * injected at the Unified KB assembly step — not left to per-niche content"), never generated
   * by the model. */
  disclaimer: { en: string; es: string };
  generatedAt: string;
}
