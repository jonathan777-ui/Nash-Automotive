import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getSection, parseKbDoc, validateKbDoc } from '../src/kb/kbDocParser.js';
import { KB_TEMPLATE_SECTIONS } from '../src/kb/types.js';

const kbSourceDir = path.join(import.meta.dirname, '..', 'kb-source');

function load(file: string): string {
  return readFileSync(path.join(kbSourceDir, file), 'utf8');
}

describe('parseKbDoc + validateKbDoc', () => {
  it('finds all 15 required sections (§0-14) in the Law Firms base layer', () => {
    const doc = parseKbDoc(load('verticals/law-firms.md'));
    expect(doc.sections).toHaveLength(15);
    expect(doc.sections.map((s) => s.number)).toEqual(Array.from({ length: 15 }, (_, i) => i));

    const validation = validateKbDoc(doc);
    expect(validation.ok).toBe(true);
    expect(validation.missingSections).toEqual([]);
  });

  it('finds all 15 required sections in the TDR single-business KB', () => {
    const doc = parseKbDoc(load('verticals/automotive__performance-tuning__track-dog-racing.md'));
    expect(doc.sections).toHaveLength(15);
    const validation = validateKbDoc(doc);
    expect(validation.ok).toBe(true);
  });

  it('does not mistake nested "### N.M" subheadings for top-level sections', () => {
    const doc = parseKbDoc(load('verticals/law-firms.md'));
    const languageSection = getSection(doc, 3)!;
    // §3 contains "### 3.1 Core rules" and "### 3.2 Dialect detection" as prose inside it,
    // not as separate top-level sections.
    expect(languageSection.body).toMatch(/3\.1 Core rules/);
    expect(languageSection.body).toMatch(/3\.2 Dialect detection/);
    expect(doc.sections).toHaveLength(15);
  });

  it('flags a doc missing the non-negotiable compliance or data-schema sections as invalid', () => {
    const withoutCompliance = load('verticals/law-firms.md').replace(
      /## 5\. COMPLIANCE GUARDRAILS[\s\S]*?(?=\n## 6\. )/,
      '',
    );
    const doc = parseKbDoc(withoutCompliance);
    const validation = validateKbDoc(doc);
    expect(validation.ok).toBe(false);
    expect(validation.missingRequiredSections).toContain(5);
  });

  it('extracts the actual compliance guardrail text for §5', () => {
    const doc = parseKbDoc(load('verticals/law-firms.md'));
    const compliance = getSection(doc, 5)!;
    expect(compliance.title).toMatch(/COMPLIANCE GUARDRAILS/);
    expect(compliance.body).toMatch(/No legal advice\. Ever\./);
  });

  it('kb-template.md\'s own section list matches what real KBs implement', () => {
    expect(KB_TEMPLATE_SECTIONS).toHaveLength(15);
  });
});
