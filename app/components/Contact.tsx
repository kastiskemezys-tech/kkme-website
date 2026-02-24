'use client';

import { useState, type CSSProperties } from 'react';

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

const BASE_STYLE: CSSProperties = {
  ...MONO,
  fontSize: '0.625rem',
  letterSpacing: '0.08em',
  color: 'rgba(232, 226, 217, 0.3)',
  textDecoration: 'none',
  transition: 'color 0.2s ease',
  display: 'block',
};

const HOVER_COLOR = 'rgba(232, 226, 217, 0.65)';
const BASE_COLOR  = 'rgba(232, 226, 217, 0.3)';

function ContactLink({
  href,
  children,
  target,
  rel,
}: {
  href: string;
  children: string;
  target?: string;
  rel?: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      style={{ ...BASE_STYLE, color: hovered ? HOVER_COLOR : BASE_COLOR }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </a>
  );
}

export function Contact() {
  return (
    <footer
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.6rem',
        marginTop: '2rem',
      }}
    >
      <ContactLink href="mailto:kastytis@kkme.eu">
        kastytis@kkme.eu
      </ContactLink>
      <ContactLink href="tel:+37069822225">
        +370 698 22225
      </ContactLink>
      <ContactLink
        href="https://www.linkedin.com/in/kastytis-kemezys-16965756"
        target="_blank"
        rel="noopener noreferrer"
      >
        linkedin.com/in/kastytis-kemezys-16965756
      </ContactLink>
    </footer>
  );
}
