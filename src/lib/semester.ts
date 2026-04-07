/**
 * Derives the current Berkeley semester term code.
 * Spring: Jan 10 – May 20 (SP)
 * Summer: May 21 – Aug 17 (SU)
 * Fall: Aug 18 – Dec 31 (FA)
 *
 * Returns e.g. "SP26", "FA26", "SU26"
 */
export function getCurrentTerm(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1–12
  const day = now.getDate();
  const yy = String(now.getFullYear()).slice(2);

  if (month < 5 || (month === 5 && day <= 20)) return `SP${yy}`;
  if (month < 8 || (month === 8 && day <= 17)) return `SU${yy}`;
  return `FA${yy}`;
}

export function getCurrentTerms(): string[] {
  return [getCurrentTerm()];
}
