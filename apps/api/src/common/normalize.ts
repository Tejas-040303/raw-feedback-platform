/**
 * Name normalisation used for duplicate detection.
 *
 * Two names that produce the same key are treated as the same category /
 * entity. The database enforces uniqueness on the key (see
 * db/migrations/001_init.sql), so this function decides what counts as
 * "the same name". Change it carefully: existing rows keep their old keys
 * until they are backfilled.
 */

// Legal-form suffixes that do not change which company is meant:
// "Tata Motors Ltd" and "Tata Motors" are the same entity.
const LEGAL_SUFFIXES = new Set([
  'ltd', 'limited', 'pvt', 'private', 'inc', 'incorporated',
  'llc', 'llp', 'corp', 'corporation', 'co', 'plc', 'gmbh',
]);

// Only the Combining Diacritical Marks block (é, ü, ñ ...). Stripping every
// mark (\p{M}) would delete vowel signs in Indic scripts: "दिल्ली" -> "दलल".
const LATIN_ACCENTS = /[\u0300-\u036f]/g;

export function nameKey(input: string): string {
  let s = input
    .normalize('NFKD')                 // "Café" -> "Cafe" + combining accent
    .replace(LATIN_ACCENTS, '')        // drop the accent
    .normalize('NFC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')             // "Domino's" -> "dominos"
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')  // other punctuation -> space
    .trim();

  const words = s.split(' ').filter(Boolean);
  if (words.length > 1 && words[0] === 'the') words.shift();
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) words.pop();

  s = words.join(' ');
  return s;
}

/** URL-friendly slug. Not used for identity — only for pretty URLs. */
export function slugify(input: string): string {
  return nameKey(input).replace(/ /g, '-');
}

/** Cities only need case/accent/whitespace folding, not suffix stripping. */
export function cityKey(input: string | null | undefined): string | null {
  if (input == null) return null;
  const k = input
    .normalize('NFKD')
    .replace(LATIN_ACCENTS, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
  return k === '' ? null : k;
}
