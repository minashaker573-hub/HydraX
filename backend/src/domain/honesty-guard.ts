/**
 * HYDRAX - honesty guard for admin-authored website content.
 *
 * website/check.mjs already refuses to let an unmeasured performance claim or
 * a fabricated capability ship in the site's *source*. That check runs at
 * commit/CI time, against static HTML — it has no way to catch the same
 * problem being reintroduced later through the CMS this module supports,
 * where an authorized admin (not a developer) can type a sentence straight
 * into a live section. This is the same rule, applied at the point content is
 * WRITTEN, on plain text rather than HTML, so the guarantee holds regardless
 * of which surface produced the text.
 *
 * Deliberately the same regex shape as check.mjs's `findUnmeasuredClaims` —
 * see that file for the reasoning. Kept as a separate module (not a shared
 * import) because check.mjs runs as a standalone Node script with no build
 * step against the website's static files, and this runs inside the compiled
 * backend against free-form JSON fields; duplicating ~20 lines of regex is
 * cheaper than wiring a shared package for it, and a change to one is a
 * five-minute diff to mirror in the other.
 */

// A known, pre-existing limitation inherited along with this regex: it is a
// word list, not a parse of what the word is actually doing in the sentence,
// so a sentence that happens to contain one of these words for an unrelated
// reason ("predicts failure before it happens") is treated as disclaimed
// even though nothing is actually being disclaimed. This is the same
// trade-off check.mjs already accepted for the same reason — a stricter
// check would need real sentence parsing, which is more machinery than this
// project runs anywhere else. See website-content.test.ts's capability-claim
// test for a concrete example this can miss.
const DISCLAIMED =
  /\b(?:not|no|nor|none|never|without|cannot|can't|until|before|would be|planned|research|require[sd]?|prerequisite|do not|does not|have not|will not|yet|neither|absent|lacks?|unimplemented|rather than|instead of)\b/i;

const PERF = '(?:sav|reduc|cut|increas|improv|boost|efficien|yield|accura|uptime|faster|less water)\\w*';
const PCT = '\\d+(?:\\.\\d+)?\\s*(?:%|percent)';
const QUANTIFIED = new RegExp(
  `(?:${PCT}\\s*(?:\\w+\\s+){0,3}${PERF})|(?:${PERF}\\s+(?:\\w+\\s+){0,3}(?:by\\s+)?${PCT})`,
  'gi',
);

const CAPABILITY =
  /\b(?:AI-powered|AI-driven|machine learning|predicts? (?:pump )?failure|leak localization|proven to save|guaranteed savings|clinically|scientifically proven)\b/gi;

/**
 * Names of unimplemented telemetry the CMS must not be used to advertise —
 * see docs/ARCHITECTURE.md's "what Phase 1 deliberately excludes" and the
 * Product/Live Monitoring section's own "not shown" list. Matched as whole
 * phrases, case-insensitively, and — like CAPABILITY above — exempted when
 * the sentence disclaims it (contains "not", "yet", "no", etc.): the real
 * seeded copy for that section says "Not shown: water flow, pump condition,
 * weather... no sensor exists for them yet", which correctly must NOT be
 * flagged — naming an absent capability to say it doesn't exist is the
 * opposite of claiming it. What this blocks is the un-disclaimed version:
 * "HYDRAX includes flow monitoring for accurate water accounting".
 */
const UNSUPPORTED_TELEMETRY =
  /\b(?:weather (?:data|forecast)|flow (?:rate|monitoring|sensor)|pump (?:health|condition) monitoring|temperature sensing|remote (?:irrigation )?control|leak detection)\b/gi;

/**
 * Scans one plain-text field for a claim this project cannot currently
 * support. Returns a list of human-readable problems (empty when clean).
 */
export function findUnmeasuredClaims(text: string): string[] {
  if (typeof text !== 'string' || text.trim() === '') return [];

  const sentences = text.split(/(?<=[.!?])\s+/);
  const hits: string[] = [];

  for (const sentence of sentences) {
    const disclaimed = DISCLAIMED.test(sentence);

    QUANTIFIED.lastIndex = 0;
    CAPABILITY.lastIndex = 0;
    UNSUPPORTED_TELEMETRY.lastIndex = 0;

    // A number attached to a performance word is never acceptable, even
    // inside a disclaiming sentence — see check.mjs for why.
    let match: RegExpExecArray | null;
    while ((match = QUANTIFIED.exec(sentence)) !== null) {
      hits.push(`unmeasured performance claim: "${match[0].trim().slice(0, 80)}"`);
    }

    if (disclaimed) continue;

    while ((match = CAPABILITY.exec(sentence)) !== null) {
      hits.push(`unverified capability claim: "${match[0].trim()}"`);
    }
    while ((match = UNSUPPORTED_TELEMETRY.exec(sentence)) !== null) {
      hits.push(`describes telemetry the current hardware does not support: "${match[0].trim()}"`);
    }
  }

  return [...new Set(hits)];
}
