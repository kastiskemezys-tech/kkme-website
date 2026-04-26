import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataClassBadge } from '@/app/components/primitives/DataClassBadge';
import type { DataClass } from '@/app/lib/types';

// Phase 8.3 — DataClassBadge confirmation. Verifies the badge surfaces every
// value declared on the DataClass union, with brand-palette tokens (P1).

const ALL_DATACLASSES: DataClass[] = [
  'observed',
  'derived',
  'modeled',
  'proxy',
  'reference',
  'reference_estimate',
  'editorial',
];

const EXPECTED_LABEL: Record<DataClass, string> = {
  observed: 'observed',
  derived: 'derived',
  modeled: 'modeled',
  proxy: 'proxy',
  reference: 'reference',
  reference_estimate: 'ref estimate',
  editorial: 'editorial',
};

describe('DataClassBadge', () => {
  for (const dc of ALL_DATACLASSES) {
    it(`renders ${dc} with the expected label`, () => {
      const html = renderToStaticMarkup(<DataClassBadge dataClass={dc} />);
      expect(html).toContain(EXPECTED_LABEL[dc]);
    });
  }

  it('proxy carries the ⚠ marker (data-class warning surface)', () => {
    const html = renderToStaticMarkup(<DataClassBadge dataClass="proxy" />);
    expect(html).toContain('⚠');
    expect(html).toMatch(/var\(--amber\)/);
  });

  it('observed renders mint-filled (per P1 expansive/wide/observed)', () => {
    const html = renderToStaticMarkup(<DataClassBadge dataClass="observed" />);
    expect(html).toMatch(/background-color:\s*var\(--mint\)/);
  });

  it('modeled uses lavender + dashed border (per P1 modelled/structural)', () => {
    const html = renderToStaticMarkup(<DataClassBadge dataClass="modeled" />);
    expect(html).toMatch(/var\(--lavender\)/);
    expect(html).toMatch(/dashed/);
  });

  it('reference / editorial are subtle ink (informational, not warning)', () => {
    const ref = renderToStaticMarkup(<DataClassBadge dataClass="reference" />);
    const ed = renderToStaticMarkup(<DataClassBadge dataClass="editorial" />);
    expect(ref).toMatch(/var\(--ink-subtle\)/);
    expect(ed).toMatch(/var\(--ink-subtle\)/);
  });

  it('falls back to "derived" styling for an unknown DataClass at runtime', () => {
    // @ts-expect-error -- intentionally pass an out-of-union value
    const html = renderToStaticMarkup(<DataClassBadge dataClass="unknown_class" />);
    expect(html).toContain('derived');
  });
});
