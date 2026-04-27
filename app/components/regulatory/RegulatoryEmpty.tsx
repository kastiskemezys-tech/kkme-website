/**
 * Fallback states for /regulatory: feed missing, schema mismatch, empty items.
 */
import { type LoadResult } from '@/lib/regulatory';

interface Props {
  result: Exclude<LoadResult, { ok: true }>;
  description?: string;
  nextRun?: string;
}

export function RegulatoryEmpty({ result, description, nextRun }: Props) {
  const { title, body } = explain(result);

  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        border: '1px solid var(--border-subtle)',
        background: 'var(--surface-1)',
      }}
    >
      <h3
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          margin: '0 0 12px',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-base)',
          color: 'var(--text-tertiary)',
          lineHeight: 1.55,
          maxWidth: '52ch',
          margin: '0 auto',
        }}
      >
        {body}
      </p>
      {description ? (
        <p
          style={{
            marginTop: '20px',
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-muted)',
            maxWidth: '52ch',
            marginInline: 'auto',
          }}
        >
          {description}
        </p>
      ) : null}
      {nextRun ? (
        <p
          style={{
            marginTop: '12px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.04em',
          }}
        >
          Next run: {nextRun.slice(0, 10)}
        </p>
      ) : null}
    </div>
  );
}

function explain(result: Exclude<LoadResult, { ok: true }>): { title: string; body: string } {
  switch (result.reason) {
    case 'feed-missing':
      return {
        title: 'Feed unavailable',
        body:
          'No regulatory feed file found at build time. Last successful update is not yet available; check back after the next scheduled run.',
      };
    case 'schema-major-mismatch':
      return {
        title: 'Feed temporarily unavailable',
        body: `The regulatory feed reported schema_version "${result.schemaVersion}", which this build does not support. The feed will return after the website is updated.`,
      };
    case 'schema-shape-mismatch':
      return {
        title: 'Feed temporarily unavailable',
        body: `The regulatory feed payload did not match the expected shape. First issues: ${result.issuesSummary}. The feed will return after the producer corrects the file.`,
      };
  }
}
