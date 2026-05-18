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
        paddingTop: '80px', paddingRight: 'var(--space-md)', paddingBottom: '120px', paddingLeft: 'var(--space-md)',
        maxWidth: '720px',
        margin: '0 auto',
        color: 'var(--text-primary)',
        background: 'var(--bg)',
      }}
    >
      <header style={{ marginBottom: 'var(--space-lg)' }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginTop: 0, marginRight: 0, marginBottom: 'var(--space-xs)', marginLeft: 0,
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
              <h1 id={slugify(children)} style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--type-display-lg)', fontWeight: 500, lineHeight: 1.2, marginTop: 0, marginRight: 0, marginBottom: 'var(--space-md)', marginLeft: 0 }}>
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 id={slugify(children)} style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--type-display-md)', fontWeight: 500, lineHeight: 1.3, marginTop: '40px', marginRight: 0, marginBottom: 'var(--space-sm)', marginLeft: 0, color: 'var(--text-primary)' }}>
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 id={slugify(children)} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-base)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginTop: 'var(--space-lg)', marginRight: 0, marginBottom: '12px', marginLeft: 0 }}>
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-base)', lineHeight: 1.75, color: 'var(--text-secondary)', marginTop: 0, marginRight: 0, marginBottom: 'var(--space-sm)', marginLeft: 0 }}>
                {children}
              </p>
            ),
            li: ({ children }) => (
              <li style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-base)', lineHeight: 1.75, color: 'var(--text-secondary)', marginTop: 0, marginRight: 0, marginBottom: '6px', marginLeft: 0 }}>
                {children}
              </li>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target={href?.startsWith('http') ? '_blank' : undefined}
                rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                style={{ color: 'var(--teal-accent-text)', textDecoration: 'none', borderBottom: '1px dotted var(--teal)' }}
              >
                {children}
              </a>
            ),
            code: ({ children, className }) => {
              const inline = !className;
              return inline ? (
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9em', background: 'var(--bg-elevated)', paddingTop: '1px', paddingRight: '6px', paddingBottom: '1px', paddingLeft: '6px', borderRadius: 3 }}>
                  {children}
                </code>
              ) : (
                <code className={className} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-body-md)', display: 'block' }}>
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-body-md)', background: 'var(--bg-elevated)', padding: 'var(--space-sm)', borderRadius: 4, overflowX: 'auto', marginTop: 0, marginRight: 0, marginBottom: 'var(--space-sm)', marginLeft: 0, border: '1px solid var(--border-card)' }}>
                {children}
              </pre>
            ),
            table: ({ children }) => (
              <div style={{ overflowX: 'auto', marginTop: 0, marginRight: 0, marginBottom: 'var(--space-md)', marginLeft: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)' }}>
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th style={{ textAlign: 'left', paddingTop: 'var(--space-xs)', paddingRight: '12px', paddingBottom: 'var(--space-xs)', paddingLeft: '12px', borderBottom: '1px solid var(--border-card)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td style={{ paddingTop: 'var(--space-xs)', paddingRight: '12px', paddingBottom: 'var(--space-xs)', paddingLeft: '12px', borderBottom: '1px solid var(--border-card)', color: 'var(--text-secondary)', verticalAlign: 'top' }}>
                {children}
              </td>
            ),
            hr: () => (
              <hr style={{ border: 0, borderTop: '1px solid var(--border-card)', marginTop: '40px', marginRight: 0, marginBottom: '40px', marginLeft: 0 }} />
            ),
            blockquote: ({ children }) => (
              <blockquote style={{ borderLeft: '3px solid var(--teal)', paddingTop: 'var(--space-2xs)', paddingRight: 'var(--space-sm)', paddingBottom: 'var(--space-2xs)', paddingLeft: 'var(--space-sm)', marginTop: 'var(--space-sm)', marginRight: 0, marginBottom: 'var(--space-sm)', marginLeft: 0, color: 'var(--text-muted)', fontStyle: 'italic' }}>
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
