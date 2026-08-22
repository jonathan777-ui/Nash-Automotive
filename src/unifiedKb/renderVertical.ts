import type { AtlasVertical } from '../kb/types.js';

/** Reconstructs an AtlasVertical back into the markdown shape the prompt needs, from the
 * already-parsed structured fields — avoids re-slicing the source file and keeps the prompt
 * scoped to just the relevant vertical rather than the full 20-vertical atlas (smaller prompt,
 * and still cacheable per-vertical across every company generated in that vertical). */
export function renderVerticalForPrompt(vertical: AtlasVertical): string {
  const niches = vertical.niches
    .map((n) => (n.detail ? `- *${n.name}* — ${n.detail}` : `- ${n.name}`))
    .join('\n');

  return `## ${vertical.name}
**Positioning:** ${vertical.positioning}
**Register:** ${vertical.register}
**Compliance:** ${vertical.compliance}
**Niches:**
${niches}
**Emergency/handoff:** ${vertical.emergencyHandoff}`;
}
