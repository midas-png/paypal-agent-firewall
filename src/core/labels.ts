import type { Category } from './types';

/** Human-readable category name ("gift_cards" → "gift cards"). */
export const categoryLabel = (c: Category | string): string => c.replace(/_/g, ' ');

export const categoryList = (cs: readonly (Category | string)[]): string => cs.map(categoryLabel).join(', ');
