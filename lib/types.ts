/**
 * KKME — shared types for curation and LLM digest
 */

export interface CurationEntry {
  id: string;
  url: string;
  title: string;
  raw_text: string;
  source: string;
  relevance: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  created_at: string; // ISO 8601
  summary?: string;
}

export interface DigestItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  date: string; // ISO 8601
  relevance: number;
}
