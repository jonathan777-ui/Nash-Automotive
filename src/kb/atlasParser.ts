import type { AtlasNiche, AtlasVertical, NicheAtlas } from './types.js';

const LABELS = ['Positioning', 'Register', 'Compliance', 'Niches', 'Emergency/handoff'] as const;
type Label = (typeof LABELS)[number];

const VERTICAL_HEADER_RE = /^## (\d+)\. (.+)$/gm;

function labelRegex(label: Label): RegExp {
  const escaped = label.replace(/\//g, '\\/');
  return new RegExp(`\\*\\*${escaped}:\\*\\*`, 'g');
}

/** Splits a vertical's raw block into {Positioning, Register, Compliance, Niches, Emergency/handoff}
 * by finding every "**Label:**" marker and taking the text up to the next one, regardless of
 * whether labels share a line (as in most verticals) or each start their own line. */
function splitLabeledFields(block: string): Record<Label, string> {
  const hits: { label: Label; index: number; end: number }[] = [];
  for (const label of LABELS) {
    const re = labelRegex(label);
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) {
      hits.push({ label, index: m.index, end: m.index + m[0].length });
    }
  }
  hits.sort((a, b) => a.index - b.index);

  const out = {} as Record<Label, string>;
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].end;
    const end = i + 1 < hits.length ? hits[i + 1].index : block.length;
    out[hits[i].label] = block.slice(start, end).trim();
  }
  return out;
}

function parseNiches(rawNiches: string | undefined): AtlasNiche[] {
  if (!rawNiches) return [];

  const bulletLines = rawNiches
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '));

  if (bulletLines.length > 0) {
    return bulletLines.map((line) => {
      const m = /^- \*(.+?)\*\s*—?\s*(.*)$/.exec(line);
      if (!m) return { name: line.replace(/^- /, ''), detail: null };
      return { name: m[1].trim(), detail: m[2].trim() || null };
    });
  }

  // Inline middot list, e.g. "Personal Injury · Immigration · Family/DV ..."
  // Strip a trailing parenthetical like "(Distinctives in the law base, §14.)" before splitting.
  const inline = rawNiches.replace(/\s*\([^)]*\)\s*$/, '').replace(/\.$/, '');
  return inline
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, detail: null }));
}

export function parseNicheAtlas(source: string): NicheAtlas {
  const headerMatches = [...source.matchAll(VERTICAL_HEADER_RE)];
  const verticals: AtlasVertical[] = [];

  for (let i = 0; i < headerMatches.length; i++) {
    const match = headerMatches[i];
    const number = Number(match[1]);
    let headerLine = match[2].trim();
    const blockStart = match.index! + match[0].length;
    const blockEnd = i + 1 < headerMatches.length ? headerMatches[i + 1].index! : source.length;
    const block = source.slice(blockStart, blockEnd);

    let workedExampleNote: string | null = null;
    const workedExampleMatch = /^(.*?)\s*\*\((.+)\)\*\s*$/.exec(headerLine);
    if (workedExampleMatch) {
      headerLine = workedExampleMatch[1].trim();
      workedExampleNote = workedExampleMatch[2].trim();
    }

    const fields = splitLabeledFields(block);

    verticals.push({
      number,
      name: headerLine,
      workedExampleNote,
      positioning: fields.Positioning ?? '',
      register: fields.Register ?? '',
      compliance: fields.Compliance ?? '',
      niches: parseNiches(fields.Niches),
      emergencyHandoff: fields['Emergency/handoff'] ?? '',
    });
  }

  // The atlas footer names "bench verticals" that attach the same way but have no section yet.
  const benchVerticals: string[] = [];
  const footerMatch = /Bench verticals \(([^)]+)\)/.exec(source);
  if (footerMatch) {
    for (const name of footerMatch[1].split(',')) {
      benchVerticals.push(name.trim());
    }
  }

  return { verticals, benchVerticals };
}
