import { REQUIRED_SECTION_NUMBERS } from './types.js';
import type { KbDoc, KbDocSection, KbDocValidation } from './types.js';

const SECTION_HEADER_RE = /^## (\d+)\. (.+)$/gm;

/** Parses a full KB document (a vertical base layer or a single-business KB) into its
 * kb-template.md §0-14 sections. Only exact "## N. Title" headers are section boundaries —
 * nested "### N.M ..." subheadings (e.g. "### 3.1 Core rules") stay inside their parent section. */
export function parseKbDoc(source: string): KbDoc {
  const matches = [...source.matchAll(SECTION_HEADER_RE)];
  const preamble = matches.length > 0 ? source.slice(0, matches[0].index).trim() : source.trim();

  const sections: KbDocSection[] = matches.map((match, i) => {
    const number = Number(match[1]);
    const title = match[2].trim();
    const bodyStart = match.index! + match[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index! : source.length;
    return { number, title, body: source.slice(bodyStart, bodyEnd).trim() };
  });

  return { preamble, sections };
}

export function validateKbDoc(doc: KbDoc): KbDocValidation {
  const present = new Set(doc.sections.map((s) => s.number));
  const missingSections = Array.from({ length: 15 }, (_, n) => n).filter((n) => !present.has(n));
  const missingRequiredSections = REQUIRED_SECTION_NUMBERS.filter((n) => !present.has(n));

  return {
    ok: missingRequiredSections.length === 0,
    missingSections,
    missingRequiredSections,
  };
}

export function getSection(doc: KbDoc, number: number): KbDocSection | undefined {
  return doc.sections.find((s) => s.number === number);
}
