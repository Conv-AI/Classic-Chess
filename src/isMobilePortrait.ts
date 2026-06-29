/** Coarse pointer or narrow viewport — matches CoachCard canvas heuristics. */
export function isMobilePortrait(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse), (max-width: 700px)').matches;
}
