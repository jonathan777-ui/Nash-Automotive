/** The 11-channel taxonomy is `05 §14`'s own channel map, not invented — see each channel's
 * "Covers" column there. This maps an alert's `source` string (set per-workflow, e.g.
 * 'referral-trigger', 'post-call-synthesis') to the channel it belongs in, so an alert actually
 * lands somewhere useful instead of only ever showing in the flat "Recent alerts" sidebar.
 *
 * Substring-matched against `source`, first match wins, case-insensitive - not an exact lookup
 * table, since workflow source strings vary in exact wording (e.g. 'post-call-synthesis' vs a
 * future 'dialer-hopper-summary') and a substring match tolerates that without needing every
 * workflow's source string enumerated and kept in lockstep here. Falls back to 'system-alerts' for
 * anything unrecognized, per §14's own description of that channel ("Infra/ops... automation
 * failures") - a reasonable catch-all, not a silent default.
 */
const ROUTES: readonly { readonly match: readonly string[]; readonly channel: string }[] = [
  { match: ['lead-intake', 'deep-dive', 'front-door-audit-refresh', 'front-door-audit', 'lead-score'], channel: 'new-leads' },
  { match: ['demo-generation', 'no-show', 'reengagement'], channel: 'demos' },
  { match: ['hopper', 'dialer', 'pacing-controller', 'attempt-recycling', 'post-call-synthesis', 'call-wrap-up'], channel: 'dialer' },
  { match: ['nurture'], channel: 'nurture' },
  { match: ['portal', 'esign', 'stripe-payment', 'location-contract-lock'], channel: 'portal-conversion' },
  { match: ['onboarding'], channel: 'onboarding' },
  { match: ['referral-trigger', 'health-scoring', 'tier-upgrade', 'churn', 'cx-', 'support-ticket'], channel: 'cx-retention' },
  { match: ['missed-follow-up'], channel: 'missed-follow-ups' },
  { match: ['contract-amendment', 'billing-period', 'refund', 'pipeline-reporting'], channel: 'accounting' },
  { match: ['ai-activity', 'ai-employee', 'ai-agent'], channel: 'ai-agents' },
];

const FALLBACK_CHANNEL = 'system-alerts';

export function channelForSource(source: string): string {
  const lower = source.toLowerCase();
  for (const route of ROUTES) {
    if (route.match.some((needle) => lower.includes(needle))) return route.channel;
  }
  return FALLBACK_CHANNEL;
}
