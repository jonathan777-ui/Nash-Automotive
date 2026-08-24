import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/** Maps an atlas vertical name to its pre-written base-layer file in kb-source/verticals/.
 * All 20 atlas verticals have one — discovered in a fuller export of the airlock-vertical-kb
 * skill's reference material than what shipped in the initially-installed skill package (which
 * only had law-firms.md). Explicit table rather than a slugify function: the file slugs don't
 * mechanically derive from the atlas names (e.g. "Aesthetics, Med Spas & Cosmetic" -> "aesthetics-medspa"),
 * and a wrong guess here would silently fall back to full generation instead of using the much
 * richer pre-written base — worth getting exactly right rather than approximately right. */
export const VERTICAL_BASE_FILES: Record<string, string> = {
  'Law Firms': 'law-firms.md',
  'Accounting, Tax & Bookkeeping': 'accounting-tax.md',
  'Insurance Agencies': 'insurance.md',
  'Financial & Wealth Advisory': 'financial-advisory.md',
  'Medical & Dental Practices': 'medical-dental.md',
  'Aesthetics, Med Spas & Cosmetic': 'aesthetics-medspa.md',
  'Veterinary Clinics': 'veterinary.md',
  'Behavioral Health & Therapy': 'behavioral-health.md',
  'Real Estate Brokerages': 'real-estate.md',
  'Property Management': 'property-management.md',
  'Mortgage & Lending': 'mortgage-lending.md',
  'Home Services': 'home-services.md',
  'Construction, Remodeling & General Contracting': 'construction-remodeling.md',
  'Solar & Home Energy': 'solar-home-energy.md',
  'Automotive': 'automotive.md',
  'Restaurants & Fast-Casual': 'restaurants.md',
  'Fine Dining, Catering & Private Events': 'fine-dining-events.md',
  'Hospitality & Lodging': 'hospitality-lodging.md',
  'Beauty, Hair & Personal Care': 'beauty-personal-care.md',
  'Fitness, Studios & Wellness': 'fitness-wellness.md',
};

/** One flagship niche overlay exists per vertical so far (20 of 120 named niches) — not full
 * coverage. Keyed by the exact niche name string as it appears in niche-atlas.md, verified
 * against the parsed atlas rather than guessed from the overlay file's own (differently-worded)
 * title line — e.g. the atlas says "Purchase / home loan" where the overlay file's title says
 * "PURCHASE / PRE-APPROVAL"; these map to the same overlay file. */
export const NICHE_OVERLAY_FILES: Record<string, Record<string, string>> = {
  'Law Firms': { Immigration: 'law-firms__immigration.md' },
  'Accounting, Tax & Bookkeeping': { 'Individual tax prep': 'accounting-tax__individual-tax-prep.md' },
  'Insurance Agencies': { Auto: 'insurance__auto.md' },
  'Financial & Wealth Advisory': { 'Retirement planning': 'financial-advisory__retirement-planning.md' },
  'Medical & Dental Practices': { 'Dental — general': 'medical-dental__dental.md' },
  'Aesthetics, Med Spas & Cosmetic': { 'Injectables (Botox/filler)': 'aesthetics-medspa__injectables.md' },
  'Veterinary Clinics': { 'General vet': 'veterinary__general-vet.md' },
  'Behavioral Health & Therapy': { 'Individual therapy': 'behavioral-health__individual-therapy.md' },
  'Real Estate Brokerages': { 'Residential seller/listing': 'real-estate__seller-listing.md' },
  'Property Management': { 'Maintenance/work orders': 'property-management__maintenance.md' },
  'Mortgage & Lending': { 'Purchase / home loan': 'mortgage-lending__purchase-preapproval.md' },
  'Home Services': { HVAC: 'home-services__hvac.md' },
  'Construction, Remodeling & General Contracting': {
    'Kitchen/bath remodel': 'construction-remodeling__kitchen-bath.md',
  },
  'Solar & Home Energy': { 'Residential solar': 'solar-home-energy__residential-solar.md' },
  Automotive: { 'Auto repair / mechanic': 'automotive__auto-repair.md' },
  'Restaurants & Fast-Casual': { 'Full-service': 'restaurants__full-service.md' },
  'Fine Dining, Catering & Private Events': {
    'Private events / buyouts': 'fine-dining-events__private-events.md',
  },
  'Hospitality & Lodging': { 'Hotels / boutique': 'hospitality-lodging__hotels.md' },
  'Beauty, Hair & Personal Care': { 'Hair salon': 'beauty-personal-care__hair-salon.md' },
  'Fitness, Studios & Wellness': { 'Gym / health club': 'fitness-wellness__gym.md' },
};

export interface KbGrounding {
  /** The vertical's own pre-written base-layer content, when one exists. */
  verticalBase?: string;
  /** A matching niche overlay's content, when one exists for the requested niche. Never set
   * without verticalBase also being set — an overlay only makes sense stacked on its base. */
  nicheOverlay?: string;
}

/** Looks up whatever pre-written grounding actually exists on disk for a vertical/niche pair.
 * Returns an empty object (not an error) when nothing exists — the 4 bench verticals (Funeral &
 * Memorial, Moving & Storage, Education/Childcare, Logistics & Trucking) and any niche outside
 * the 20 with an overlay currently have no pre-written content, and that's an expected, normal
 * case the caller falls back on, not a failure. */
export function loadKbGrounding(kbSourceDir: string, vertical: string, niche: string): KbGrounding {
  const verticalsDir = path.join(kbSourceDir, 'verticals');
  const grounding: KbGrounding = {};

  const baseFile = VERTICAL_BASE_FILES[vertical];
  if (baseFile) {
    const basePath = path.join(verticalsDir, baseFile);
    if (existsSync(basePath)) grounding.verticalBase = readFileSync(basePath, 'utf8');
  }

  if (grounding.verticalBase) {
    const overlayFile = NICHE_OVERLAY_FILES[vertical]?.[niche];
    if (overlayFile) {
      const overlayPath = path.join(verticalsDir, overlayFile);
      if (existsSync(overlayPath)) grounding.nicheOverlay = readFileSync(overlayPath, 'utf8');
    }
  }

  return grounding;
}
