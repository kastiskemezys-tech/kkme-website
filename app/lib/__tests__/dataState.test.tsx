import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  isValidElement,
  type ReactElement,
} from 'react';
import { DataState } from '@/app/components/primitives/DataState';

// Phase 8.3d — DataState 4-state wrapper.
// Tests cover render shape per status and verify the retry callback is wired
// without requiring a DOM (SSR + React-element introspection).

function findByTestId(node: unknown, id: string): ReactElement | null {
  if (!isValidElement(node)) return null;
  const props = node.props as { [key: string]: unknown };
  if (props['data-testid'] === id) return node;
  // If this is a component (function), expand it.
  if (typeof node.type === 'function') {
    const rendered = (node.type as (p: typeof props) => unknown)(props);
    return findByTestId(rendered, id);
  }
  const children = (props as { children?: unknown }).children;
  if (Array.isArray(children)) {
    for (const c of children) {
      const found = findByTestId(c, id);
      if (found) return found;
    }
  } else {
    const found = findByTestId(children, id);
    if (found) return found;
  }
  return null;
}

describe('DataState', () => {
  it('status="ok" renders children unchanged (no wrapper element)', () => {
    const html = renderToStaticMarkup(
      <DataState status="ok"><span data-testid="kid">Today €36/MWh</span></DataState>,
    );
    expect(html).toContain('Today €36/MWh');
    expect(html).not.toContain('datastate-stale-dot');
    expect(html).not.toContain('datastate-loading');
    expect(html).not.toContain('datastate-error');
  });

  it('status="loading" renders the skeleton placeholder, not the children', () => {
    const html = renderToStaticMarkup(
      <DataState status="loading"><span>Real data</span></DataState>,
    );
    expect(html).toContain('datastate-loading');
    expect(html).toContain('skeleton');
    expect(html).not.toContain('Real data');
  });

  it('status="stale" renders the amber dot + children + tooltip with ageHours', () => {
    const html = renderToStaticMarkup(
      <DataState status="stale" ageHours={5}>
        <span>Stale value €30/MWh</span>
      </DataState>,
    );
    expect(html).toContain('Stale value €30/MWh');
    expect(html).toContain('datastate-stale-dot');
    expect(html).toMatch(/title="data is 5 hours old"/);
    expect(html).toContain('var(--amber)');
  });

  it('status="stale" with ageHours=1 uses singular "hour"', () => {
    const html = renderToStaticMarkup(
      <DataState status="stale" ageHours={1}><span>v</span></DataState>,
    );
    expect(html).toMatch(/title="data is 1 hour old"/);
  });

  it('status="stale" without ageHours falls back to a generic tooltip', () => {
    const html = renderToStaticMarkup(
      <DataState status="stale"><span>v</span></DataState>,
    );
    expect(html).toMatch(/title="data is stale"/);
  });

  it('status="error" renders the rose dot + a default message; no retry button by default', () => {
    const html = renderToStaticMarkup(
      <DataState status="error"><span>Hidden</span></DataState>,
    );
    expect(html).toContain('datastate-error');
    expect(html).toContain('Could not load data.');
    expect(html).toContain('var(--rose)');
    expect(html).not.toContain('datastate-retry');
    expect(html).not.toContain('Hidden');
  });

  it('status="error" with errorMessage overrides the default copy', () => {
    const html = renderToStaticMarkup(
      <DataState status="error" errorMessage="Network down (504)"><span /></DataState>,
    );
    expect(html).toContain('Network down (504)');
  });

  it('status="error" with retry exposes a Retry button wired to the callback', () => {
    const cb = vi.fn();
    const tree = (
      <DataState status="error" retry={cb}><span /></DataState>
    );
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('datastate-retry');
    expect(html).toContain('Retry');

    // Reach into the React tree to call the onClick directly (no DOM).
    // DataState returns the ErrorState element, which holds the button child.
    // Easiest probe: re-render the tree as an element and find the Retry node.
    const elementTree = (DataState as unknown as (p: typeof tree.props) => ReactElement)(
      tree.props,
    );
    const retryNode = findByTestId(elementTree, 'datastate-retry');
    expect(retryNode).not.toBeNull();
    const onClick = (retryNode!.props as { onClick?: () => void }).onClick;
    expect(typeof onClick).toBe('function');
    onClick!();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
