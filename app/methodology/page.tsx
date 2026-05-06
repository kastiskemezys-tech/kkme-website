/**
 * /methodology — public-facing KKME methodology paper.
 *
 * Static-rendered server component. Reads docs/methodology.md at build time
 * via fs.readFileSync (Next.js app router + output:'export' picks this up at
 * `next build` time and pre-renders to static HTML). react-markdown +
 * remark-gfm handle the GFM features (tables, autolinks, task lists).
 *
 * Phase 29 — replaces the Phase 30 "destination decision" thread (was
 * standalone-route vs inline-drawer); operator chose standalone at Phase 29
 * Pause A.
 */
import type { Metadata } from 'next';
import fs from 'fs';
import path from 'path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const metadata: Metadata = {
  title: 'Methodology — KKME',
  description:
    'How KKME computes its Baltic BESS revenue, IRR, and dispatch numbers — data sources, formulas, calibration, and comparison to peer products.',
};

function slugify(input: unknown): string {
  const text = typeof input === 'string'
    ? input
    : Array.isArray(input)
      ? input.map(c => (typeof c === 'string' ? c : '')).join('')
      : '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export default function MethodologyPage() {
  const mdPath = path.join(process.cwd(), 'docs', 'methodology.md');
  const markdown = fs.readFileSync(mdPath, 'utf8');

  return (
    <main
      style={{
        padding: '80px 24px 120px',
        maxWidth: '720px',
        margin: '0 auto',
        color: 'var(--text-primary)',
        background: 'var(--bg)',
      }}
    >
      <header style={{ marginBottom: '32px' }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            margin: '0 0 8px',
          }}
        >
          KKME · Methodology paper
        </p>
      </header>

      <article className="methodology-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 id={slugify(children)} style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 500, lineHeight: 1.2, margin: '0 0 24px' }}>
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 id={slugify(children)} style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 500, lineHeight: 1.3, margin: '40px 0 16px', color: 'var(--text-primary)' }}>
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 id={slugify(children)} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-base)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '32px 0 12px' }}>
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-base)', lineHeight: 1.75, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                {children}
              </p>
            ),
            li: ({ children }) => (
              <li style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-base)', lineHeight: 1.75, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
                {children}
              </li>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target={href?.startsWith('http') ? '_blank' : undefined}
                rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                style={{ color: 'var(--teal)', textDecoration: 'none', borderBottom: '1px dotted var(--teal)' }}
              >
                {children}
              </a>
            ),
            code: ({ children, className }) => {
              const inline = !className;
              return inline ? (
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9em', background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 3 }}>
                  {children}
                </code>
              ) : (
                <code className={className} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', display: 'block' }}>
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', background: 'var(--bg-elevated)', padding: '16px', borderRadius: 4, overflowX: 'auto', margin: '0 0 16px', border: '1px solid var(--border-card)' }}>
                {children}
              </pre>
            ),
            table: ({ children }) => (
              <div style={{ overflowX: 'auto', margin: '0 0 24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)' }}>
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border-card)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-card)', color: 'var(--text-secondary)', verticalAlign: 'top' }}>
                {children}
              </td>
            ),
            hr: () => (
              <hr style={{ border: 0, borderTop: '1px solid var(--border-card)', margin: '40px 0' }} />
            ),
            blockquote: ({ children }) => (
              <blockquote style={{ borderLeft: '3px solid var(--teal)', padding: '4px 16px', margin: '16px 0', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {children}
              </blockquote>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </main>
  );
}
