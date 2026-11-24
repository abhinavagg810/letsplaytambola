import { ruleName } from '@/core';
import type { RuleId } from '@/core';

/** "King’s Corner" → "kings-corner", "Temperature / BP" → "temperature-bp": the anchor of a pattern on /ways-to-win. */
export const slugify = (s: string): string => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const ruleSlug = (id: RuleId): string => slugify(ruleName(id));
export const waysHref = (id: RuleId): string => `/ways-to-win#${ruleSlug(id)}`;
