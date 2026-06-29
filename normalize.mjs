// normalize.mjs — shared name/title normalization for cross-source dedup.
// Zero deps. Used by scan.mjs (JobSpy company-exclusion + canonical dedup) and
// db.mjs (persisting the canonical key).
//
// The problem: the SAME job can arrive from a direct ATS feed (greenhouse URL)
// and from a JobSpy board search (indeed/linkedin URL). Different URLs defeat
// exact-URL dedup, and company strings differ ("Stripe" vs "Stripe Inc"), so a
// source-agnostic canonical key is needed.

const COMPANY_SUFFIXES =
  /\b(inc|llc|corp|corporation|ltd|limited|lp|llp|plc|sa|ag|nv|group|holdings|holding|co|company|the|partners|capital|securities|management|global|international)\b/g;

/**
 * Collapse a company name to a comparable token: lowercase, drop punctuation
 * and common legal/filler suffixes, strip whitespace.
 *   "Goldman Sachs"      -> "goldmansachs"
 *   "Stripe, Inc."       -> "stripe"
 *   "Citadel Securities" -> "citadel"
 * @param {string} s
 * @returns {string}
 */
export function normCompany(s) {
  return (s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Collapse a job title to a comparable token: lowercase, punctuation to single
 * spaces, trimmed. Keeps word order so distinct roles stay distinct.
 * @param {string} s
 * @returns {string}
 */
export function normTitle(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Source-agnostic dedup key: normalized company + title. Two postings with the
 * same key are treated as the same role regardless of which source/URL carried
 * them. Returns '' when either part is empty (caller should skip canon dedup
 * then — don't collapse unrelated dateless/companyless rows).
 * @param {string} company
 * @param {string} title
 * @returns {string}
 */
export function canonKey(company, title) {
  const c = normCompany(company);
  const t = normTitle(title);
  if (!c || !t) return '';
  return `${c}|${t}`;
}
