import type Anthropic from '@anthropic-ai/sdk';
import type { CompanyProfile } from '../company/types.js';
import type { KbGrounding } from './kbLibrary.js';

export interface StaticKbContext {
  kbTemplate: string;
  compliancePatterns: string;
  languageDialectLayer: string;
  /** law-firms.md — "the completed, worked example... New verticals should match its depth,
   * bilingual coverage, and compliance rigor," per the airlock-vertical-kb skill's own
   * instructions. Included as a universal quality-bar fallback for verticals with no pre-written
   * base layer of their own (see kbLibrary.ts) — not as content to imitate for other verticals. */
  goldStandardExample: string;
}

/** Two cache_control breakpoints: the first covers everything static across every generation
 * regardless of vertical (template structure, shared compliance/dialect layers, the gold-standard
 * exemplar); the second covers the vertical-specific content, static across every company in that
 * vertical but different between verticals — either a pre-written base layer (+ niche overlay)
 * when kbLibrary.ts has one, or the raw atlas breadth-map entry when it doesn't. Company-specific
 * facts live only in the user message, after both breakpoints, so they never invalidate either
 * cached prefix. */
export function buildSystemBlocks(
  staticContext: StaticKbContext,
  verticalText: string,
  grounding: KbGrounding = {},
): Anthropic.Messages.TextBlockParam[] {
  const perVerticalText = grounding.verticalBase
    ? [
        'This vertical has a pre-written base-layer KB — treat it as the authoritative source for this vertical, not just a style reference. Adapt it into a complete single-business KB for the specific company described in the next message: keep its section structure, compliance rigor, and bilingual scripts, but replace every vertical-generic or placeholder fact with that company\'s actual details. Do not simply copy it verbatim.',
        grounding.verticalBase,
        grounding.nicheOverlay
          ? [
              '',
              'This niche has its own overlay, meant to stack on top of the base layer above (its lettered sections — voice tuning, glossary additions, intent/intake additions, niche FAQs, authorized fees, booking/urgency notes, website/chatbot copy adds). It may only tighten compliance from the base layer, never loosen it. Apply it on top of the base layer before producing the final single-business KB:',
              grounding.nicheOverlay,
            ].join('\n\n')
          : '',
        '',
        `For reference, this is where the niche sits in the full vertical breadth map:\n${verticalText}`,
      ].join('\n\n')
    : [
        'No pre-written base layer exists yet for this vertical — generate the full KB from this breadth-map entry, matching the gold-standard exemplar above in depth, bilingual coverage, and compliance rigor:',
        verticalText,
      ].join('\n\n');

  return [
    {
      type: 'text',
      text: [
        'You are generating a knowledge base for the Airlock platform, following this exact section structure for every KB you produce:',
        staticContext.kbTemplate,
        '',
        "Shared compliance patterns every vertical inherits (a niche overlay may only tighten these, never loosen them):",
        staticContext.compliancePatterns,
        '',
        'Shared bilingual/dialect layer every KB inherits:',
        staticContext.languageDialectLayer,
        '',
        'Gold-standard worked example to match in depth, bilingual coverage, and compliance rigor (this is the Law Firms base layer — match its quality bar; if the vertical below has its own pre-written base layer, that takes priority as the content source):',
        staticContext.goldStandardExample,
      ].join('\n\n'),
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: perVerticalText,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

export function buildUserMessage(profile: CompanyProfile, niche: string): string {
  const hours =
    profile.services.weekdayDescriptions?.join('; ') ??
    'not known — omit specific hours, use a placeholder the business can fill in';

  return `Generate a complete, deploy-ready single-business KB for the niche "${niche}" within the vertical above, for this specific business:

Company: ${profile.company.name}
Address: ${profile.company.address ?? 'unknown'}
Phone: ${profile.contact.phone ?? 'unknown'}
Website: ${profile.company.website ?? 'unknown'}
Hours: ${hours}
${profile.background.description ? `Background: ${profile.background.description}` : ''}

Follow the required section structure exactly (§0 through §14, in order, using "## N. Title" headers). Write every bilingual (EN/ES) script pair the template calls for. Do not include the standing AI-demo disclaimer text yourself — that gets added separately, outside this document.`;
}
