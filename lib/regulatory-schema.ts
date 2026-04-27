/**
 * Regulatory feed schema validation.
 *
 * Pinned to schema_version 1.x — major-version bumps refuse to render per the
 * feed contract at docs/contracts/regulatory-feed/HANDOVER.md §3, §7.
 *
 * Build-time validation: a feed file with the wrong shape causes the
 * /regulatory page (and the homepage preview) to render a fallback message
 * via lib/regulatory.ts. The rest of the site continues to ship.
 */
import { z } from 'zod';

export const SUPPORTED_MAJOR = '1';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const sourceTypeSchema = z.enum([
  'lt_primary_legislation',
  'lt_regulation',
  'eu_regulation',
  'news',
  'enforcement',
]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const impactSchema = z.enum(['high', 'medium', 'low']);
export type Impact = z.infer<typeof impactSchema>;

export const itemSchema = z.object({
  id: z.string().min(1),
  scan_date: dateString,
  event_date: dateString,
  event_date_qualifier: z.literal('deadline').optional(),
  title: z.string().min(1),
  title_lt: z.string().optional(),
  summary: z.string().min(1),
  source: z.string().min(1),
  source_type: sourceTypeSchema,
  source_url: z.string().url(),
  act_reference: z.string().optional(),
  impact: impactSchema,
  // category is permissive: HANDOVER §7 says still render unknown values with raw label.
  category: z.string().min(1),
  tags: z.array(z.string()),
});
export type RegulatoryItem = z.infer<typeof itemSchema>;

export const feedMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  publisher: z.string(),
  publisher_url: z.string().url(),
  language: z.string(),
  language_secondary: z.string().optional(),
  last_updated: z.string(),
  next_run: z.string(),
  cadence: z.string(),
  items_count: z.number().int().nonnegative(),
});
export type RegulatoryMetadata = z.infer<typeof feedMetadataSchema>;

export const feedSchema = z.object({
  schema_version: z.string(),
  feed_metadata: feedMetadataSchema,
  categories: z.array(z.string()),
  impact_levels: z.record(impactSchema, z.string()),
  items: z.array(itemSchema),
});
export type RegulatoryFeed = z.infer<typeof feedSchema>;
