import { describe, expect, it, vi } from 'vitest';
import { fetchCompanyInfo } from '../../src/webscrape/fetchCompanyInfo.js';

describe('fetchCompanyInfo', () => {
  it('maps a successful fetch + JSON-LD extraction into a CompanyProfile', async () => {
    const html = `<script type="application/ld+json">
      {"@type":"AutoRepair","name":"Track Dog Racing","telephone":"214-340-9797","description":"Miata specialists since 2002."}
    </script>`;
    const fetchImpl = vi.fn(async () => new Response(html, { status: 200 })) as unknown as typeof fetch;

    const result = await fetchCompanyInfo('https://trackdogracing.com', fetchImpl);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.company.name).toBe('Track Dog Racing');
    expect(result.profile.company.website).toBe('https://trackdogracing.com');
    expect(result.profile.contact.phone).toBe('214-340-9797');
    expect(result.profile.background.source).toBe('website-scrape');
    expect(result.profile.background.description).toBe('Miata specialists since 2002.');
  });

  it('fails cleanly on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    const result = await fetchCompanyInfo('https://example.com/gone', fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/404/);
  });

  it('fails cleanly on a network error rather than throwing', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('DNS lookup failed');
    }) as unknown as typeof fetch;
    const result = await fetchCompanyInfo('https://does-not-resolve.example', fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('DNS lookup failed');
  });

  it('fails cleanly when the page has no extractable name at all', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html><body>no title, no json-ld</body></html>', { status: 200 })) as unknown as typeof fetch;
    const result = await fetchCompanyInfo('https://example.com/blank', fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no business name/);
  });
});
