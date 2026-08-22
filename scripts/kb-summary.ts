import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseNicheAtlas, parseKbDoc, validateKbDoc } from '../src/kb/index.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const kbSource = path.join(root, 'kb-source');

const atlas = parseNicheAtlas(readFileSync(path.join(kbSource, 'niche-atlas.md'), 'utf8'));
const totalNiches = atlas.verticals.reduce((n, v) => n + v.niches.length, 0);

console.log(`niche-atlas.md: ${atlas.verticals.length} verticals, ${totalNiches} named niches`);
console.log(`bench verticals (not yet built out): ${atlas.benchVerticals.join(', ')}`);
console.log();
for (const v of atlas.verticals) {
  console.log(`  ${v.number}. ${v.name} — ${v.niches.length} niches`);
}

console.log();
for (const [label, file] of [
  ['law-firms.md (base layer)', 'verticals/law-firms.md'],
  ['TDR (single-business KB)', 'verticals/automotive__performance-tuning__track-dog-racing.md'],
] as const) {
  const doc = parseKbDoc(readFileSync(path.join(kbSource, file), 'utf8'));
  const validation = validateKbDoc(doc);
  console.log(
    `${label}: ${doc.sections.length}/15 sections present, valid=${validation.ok}` +
      (validation.missingSections.length ? `, missing §${validation.missingSections.join(', §')}` : ''),
  );
}
