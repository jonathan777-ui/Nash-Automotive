import type Anthropic from '@anthropic-ai/sdk';
import type { CompanyProfile } from '../company/types.js';

export interface StaticKbContext {
  kbTemplate: string;
  compliancePatterns: string;
  languageDialectLayer: string;
  /** law-firms.md — "the completed, worked example... New verticals should match its depth,
   * bilingual coverage, and compliance rigor," per the airlock-vertical-kb skill's own
   * instructions. Included as a quality bar, not as content to imitate for other verticals. */
  goldStandardExample: string;
}

/** Two cache_control breakpoints: the first covers everything static across every generation
 * regardless of vertical (template structure, shared compliance/dialect layers, the gold-standard
 * exemplar); the second covers the vertical-specific atlas entry, static across every company in
 * that vertical but different between verticals. Company-specific facts live only in the user
 * message, after both breakpoints, so they never invalidate either cached prefix. */
export function buildSystemBlocks(
  staticContext: StaticKbContext,
  verticalText: string,
): Anthropic.Messages.TextBlockParam[] {
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
        'Gold-standard worked example to match in depth, bilingual coverage, and compliance rigor (this is the Law Firms base layer — match its quality bar, not its vertical-specific content):',
        staticContext.goldStandardExample,
      ].join('\n\n'),
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: `Vertical this KB is for:\n${verticalText}`,
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
