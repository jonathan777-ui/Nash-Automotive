import { describe, expect, it } from 'vitest';
import { channelForSource } from '../../src/messaging/alertRouting.js';

describe('channelForSource', () => {
  it.each([
    ['lead-intake-to-demo-dashboard', 'new-leads'],
    ['front-door-audit-refresh', 'new-leads'],
    ['demo-generation-trigger', 'demos'],
    ['hopper-request-next', 'dialer'],
    ['pacing-controller', 'dialer'],
    ['post-call-synthesis', 'dialer'],
    ['nurture-cadence', 'nurture'],
    ['stripe-payment-to-crm', 'portal-conversion'],
    ['portal-esign-submitted', 'portal-conversion'],
    ['location-contract-lock-check', 'portal-conversion'],
    ['onboarding-provisioning', 'onboarding'],
    ['referral-trigger', 'cx-retention'],
    ['health-scoring', 'cx-retention'],
    ['missed-follow-up-detector', 'missed-follow-ups'],
    ['contract-amendment-flow', 'accounting'],
    ['billing-period-rollover', 'accounting'],
    ['ai-activity-summary', 'ai-agents'],
  ])('routes source %s to #%s', (source, expected) => {
    expect(channelForSource(source)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(channelForSource('STRIPE-PAYMENT-TO-CRM')).toBe('portal-conversion');
  });

  it('falls back to system-alerts for an unrecognized source', () => {
    expect(channelForSource('some-brand-new-workflow-nobody-mapped-yet')).toBe('system-alerts');
  });
});
