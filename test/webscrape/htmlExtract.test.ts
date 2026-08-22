import { describe, expect, it } from 'vitest';
import { extractCompanyInfoFromHtml } from '../../src/webscrape/htmlExtract.js';

describe('extractCompanyInfoFromHtml', () => {
  it('prefers JSON-LD LocalBusiness data when present', () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
        {"@type":"AutoRepair","name":"Track Dog Racing","telephone":"214-340-9797",
         "address":{"streetAddress":"123 Race Way","addressLocality":"Fort Worth","addressRegion":"TX","postalCode":"76102"},
         "openingHoursSpecification":[{"dayOfWeek":["Monday","Tuesday"],"opens":"09:00","closes":"17:00"}]}
      </script>
      <title>Fallback Title</title>
      </head><body></body></html>`;

    const info = extractCompanyInfoFromHtml(html);
    expect(info.source).toBe('jsonld');
    expect(info.name).toBe('Track Dog Racing');
    expect(info.phone).toBe('214-340-9797');
    expect(info.address).toBe('123 Race Way, Fort Worth, TX, 76102');
    expect(info.hoursText).toEqual(['Monday, Tuesday 09:00-17:00']);
  });

  it('handles JSON-LD wrapped in an @graph array', () => {
    const html = `<script type="application/ld+json">
      {"@graph":[{"@type":"WebSite","name":"ignore me"},
                 {"@type":"Restaurant","name":"Real Business","telephone":"555-1234","openingHours":"Mo-Fr 09:00-17:00"}]}
    </script>`;
    const info = extractCompanyInfoFromHtml(html);
    expect(info.source).toBe('jsonld');
    expect(info.name).toBe('Real Business');
    expect(info.hoursText).toEqual(['Mo-Fr 09:00-17:00']);
  });

  it('falls back to title/meta/phone-regex when there is no usable JSON-LD', () => {
    const html = `
      <html><head>
        <title>Joe's Plumbing — 24/7 Service</title>
        <meta name="description" content="Family-owned plumbing in Austin, TX.">
      </head><body>Call us at (512) 555-0134 today.</body></html>`;

    const info = extractCompanyInfoFromHtml(html);
    expect(info.source).toBe('meta-fallback');
    expect(info.name).toBe("Joe's Plumbing — 24/7 Service");
    expect(info.description).toBe('Family-owned plumbing in Austin, TX.');
    expect(info.phone).toBe('(512) 555-0134');
  });

  it('does not crash on malformed JSON-LD, and falls back instead', () => {
    const html = `<script type="application/ld+json">{ not valid json </script><title>Still Works</title>`;
    const info = extractCompanyInfoFromHtml(html);
    expect(info.source).toBe('meta-fallback');
    expect(info.name).toBe('Still Works');
  });

  it('ignores JSON-LD nodes that do not look like a business (e.g. a bare WebSite node)', () => {
    const html = `<script type="application/ld+json">{"@type":"WebSite","name":"Some Site"}</script><title>Title Fallback</title>`;
    const info = extractCompanyInfoFromHtml(html);
    expect(info.source).toBe('meta-fallback');
    expect(info.name).toBe('Title Fallback');
  });
});
