/** Shared helpers for PDF bbox highlight navigation. */

export function firstPageFromHighlights(highlights: { page_idx: number }[]): number | null {
  if (!highlights.length) return null;
  return Math.min(...highlights.map((h) => h.page_idx)) + 1;
}
