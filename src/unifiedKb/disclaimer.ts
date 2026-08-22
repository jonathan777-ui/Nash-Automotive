/** Standing policy (from the brief): "every demo (receptionist/chatbot/website) must open with a
 * fixed bilingual disclaimer stating it's an AI demo built for {company_name} from public info,
 * not their live system. This gets injected at the Unified KB assembly step — not left to
 * per-niche content." Deliberately deterministic text, not model-generated — the model isn't
 * asked to reproduce this, so there's nothing for it to get subtly wrong. */
export function buildDisclaimer(companyName: string): { en: string; es: string } {
  return {
    en:
      `This is an AI demo built for ${companyName} from publicly available information — ` +
      `it is not ${companyName}'s live phone system, chatbot, or website.`,
    es:
      `Esta es una demostración de IA creada para ${companyName} a partir de información ` +
      `disponible públicamente — no es el sistema telefónico, chatbot ni sitio web real de ${companyName}.`,
  };
}
