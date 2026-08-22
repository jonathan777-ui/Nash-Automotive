/** The Company Profile the input cascade (GBP link → website scrape → manual form) populates,
 * per the brief: "combine whatever the cascade produces with the matching niche KB to populate
 * the Company Profile (Company, Contact, Background, Services)." Enrichment against the niche
 * KB (checkpoint 4) fills in what the raw source data can't — this type only holds what a
 * cascade step can actually observe about the business itself. */
export interface OpeningHoursPeriod {
  /** 0 = Sunday, matching Google's convention, since GBP is the primary source. */
  day: number;
  open: string; // "HH:MM", 24h
  close: string; // "HH:MM", 24h
}

export interface CompanyProfile {
  company: {
    name: string;
    address?: string;
    website?: string;
    /** Google's business status vocabulary (OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY)
     * when the source is GBP; left undefined for other sources. */
    businessStatus?: string;
    primaryType?: string;
    types?: string[];
    rating?: number;
    userRatingCount?: number;
  };
  contact: {
    phone?: string;
  };
  background: {
    source: 'gbp' | 'website-scrape' | 'manual-form';
    sourceUrl?: string;
    fetchedAt: string; // ISO 8601
  };
  services: {
    /** Human-readable per-day hours, good enough to read straight into a receptionist script. */
    weekdayDescriptions?: string[];
    /** Structured hours, for logic that needs to reason about open/closed rather than just recite it. */
    periods?: OpeningHoursPeriod[];
  };
}
