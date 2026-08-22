import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { StaticKbContext } from './promptBuilder.js';

export function loadStaticKbContext(kbSourceDir: string): StaticKbContext {
  const read = (p: string) => readFileSync(path.join(kbSourceDir, p), 'utf8');
  return {
    kbTemplate: read('kb-template.md'),
    compliancePatterns: read('compliance-patterns.md'),
    languageDialectLayer: read('language-dialect-layer.md'),
    goldStandardExample: read('verticals/law-firms.md'),
  };
}
