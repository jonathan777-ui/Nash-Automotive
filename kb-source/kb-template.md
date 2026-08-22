# KB Template — required section structure for every vertical/niche

Every Airlock KB MUST contain these sections. The Law base
(`references/verticals/law-firms.md`) is the reference implementation — match its depth.

```
0.  How to use this KB        — one paragraph: the agent's role and what it must never do.
1.  Positioning & promise     — premium framing; the 20-second felt experience.
2.  Persona & voice           — character, tone, pace; how voice shifts by niche.
3.  Language & dialect        — inherit language-dialect-layer.md + vertical glossary (EN↔ES).
4.  Intent map                — caller type → route (new lead, existing customer, emergency,
                                wrong party, vendor, billing, info). New lead = top priority.
5.  COMPLIANCE GUARDRAILS      — the hard lines (pull the vertical's pattern from
                                compliance-patterns.md). Includes emergency/escalation path.
6.  Intake & qualification    — universal fields + niche fields; conversational, not interrogation.
7.  FAQ bank (EN/ES)          — answers that stay inside §5; dialect variants where useful.
8.  Booking & scheduling      — offer 2 concrete slots; consult type; what to bring; confirm.
9.  Data schema               — exact CRM fields (contact + matter/job + activity), incl.
                                preferred_language, spanish_variety, urgency, disposition.
10. Objection & sensitive     — cost anxiety, distress, fear, hostility, "just tell me what to do."
11. Human-handoff triggers    — when to escalate to a live person / flag URGENT.
12. Website copy blocks (EN/ES)— hero, trust strip, CTAs, card stubs.
13. Chatbot quick-replies      — entry buttons; same intent map + compliance in text.
14. Niche tree / overlays      — (base layer only) the niches that stack on this base.
```

Rules:
- Never omit §5 (Compliance) or §9 (Data schema).
- Bilingual scripts in §5/§7/§10/§12 show EN and ES pairs; use dialect variants where it changes
  the phrasing meaningfully, not as filler.
- Keep advice OUT. The agent welcomes, screens, captures, schedules, reassures, escalates.
