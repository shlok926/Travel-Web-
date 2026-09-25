/**
 * Utility for normalizing and generating URL-safe slugs for catalogue entities.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD') // Decompose combined graphemes
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric chars with hyphens
    .replace(/^-+|-+$/g, '') // Trim leading and trailing hyphens
    .substring(0, 100); // Enforce max length bound
}
