// Phase 50 — `/contact` interpolated submitted fields into an HTML email raw.
//
// `<p><strong>Name:</strong> ${name}</p>` with `name` straight off a public,
// unauthenticated form. A different risk class from the KV writers: nothing in
// KV is corrupted, but the operator opens the result in a mail client, so the
// submitter authors markup in a document a human reads. One interpolation was
// inside an attribute — `href="mailto:${email}"` — where a bare quote closes the
// attribute and everything after it becomes markup.
//
// These tests use payloads that actually break out, not sanitised examples: if
// the escaping regresses, the assertion must fail because the payload works.
import { describe, it, expect } from 'vitest';
import {
  escapeHtml, safeMailtoHref, buildContactEmailHtml, CONTACT_EMAIL_FIELDS,
} from '../fetch-s1.js';

const base = {
  type: 'project', name: 'A Person', email: 'a@example.com',
  message: 'We are developing a 50 MW BESS.',
};

describe('escapeHtml covers attribute position, not just text', () => {
  it('escapes all five characters', () => {
    expect(escapeHtml('<b>&"\'')).toBe('&lt;b&gt;&amp;&quot;&#39;');
  });

  it('escapes the ampersand FIRST, so escapes are not double-escaped wrongly', () => {
    // & last would turn `&lt;` into `&amp;lt;` and render the tag as text of
    // an escape rather than escaped text. Order is load-bearing.
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('handles null and undefined without emitting the words', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('the email body escapes every interpolated value', () => {
  it('neutralises a script tag in the name', () => {
    const html = buildContactEmailHtml({ ...base, name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('neutralises markup in the free-text message', () => {
    const html = buildContactEmailHtml({ ...base, message: '<img src=x onerror="alert(1)">' });
    // The property is "no live tag", not "the word onerror is absent". Once the
    // angle brackets and quotes are escaped the whole payload is inert TEXT, and
    // `onerror=` survives inside it as characters — asserting on that substring
    // would be testing spelling rather than safety.
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('onerror=&quot;');   // escaped, i.e. not an attribute
    expect(html).not.toMatch(/<img[^>]*onerror/i);
  });

  it('survives the quoted-attribute break — the case a text-only escaper misses', () => {
    // Closes the href, then adds an event handler. If `"` is unescaped this
    // produces a live onmouseover in the operator's mail client.
    const payload = 'x@y.com" onmouseover="alert(1)';
    const html = buildContactEmailHtml({ ...base, email: payload });
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).not.toMatch(/href="[^"]*"\s+on/);
    expect(html).toContain('&quot;');
  });

  it('refuses a javascript: scheme as an href, rendering it as text', () => {
    // Escaping alone leaves `javascript:alert(1)` a working href. The scheme
    // check is what makes it inert.
    const html = buildContactEmailHtml({ ...base, email: 'javascript:alert(1)' });
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toContain('<a href');
    expect(html).toContain('javascript:alert(1)'.replace(/:/g, ':')); // present as text
  });

  it('still links a legitimate address', () => {
    const html = buildContactEmailHtml(base);
    expect(html).toContain('<a href="mailto:a%40example.com">');
    expect(html).toContain('a@example.com');
  });

  it('escapes every optional field too', () => {
    const html = buildContactEmailHtml({
      ...base,
      company: '<b>Co</b>', projectName: '"><h1>x', mwMwh: '<i>50</i>',
      country: '<u>LT</u>', targetCod: "<'2027'>",
    });
    for (const bad of ['<b>', '<h1>', '<i>', '<u>']) expect(html).not.toContain(bad);
    expect(html).not.toMatch(/"><h1>/);
  });

  it('emits no unescaped angle bracket outside the literal template markup', () => {
    // Behavioural catch-all: strip the tags the template itself writes, and
    // nothing attacker-controlled may remain that looks like a tag.
    const nasty = '<svg/onload=alert(1)>';
    const html = buildContactEmailHtml({
      ...base, name: nasty, company: nasty, message: nasty,
    });
    const withoutTemplate = html.replace(/<\/?(p|strong|hr|a)\b[^>]*>/g, '');
    expect(withoutTemplate).not.toMatch(/<[a-zA-Z/]/);
  });
});

describe('the email field set is an allowlist', () => {
  it('a field not on the list never reaches the email', () => {
    const html = buildContactEmailHtml({ ...base, secretInternalNote: 'DO-NOT-SEND-abc123' });
    expect(html).not.toContain('DO-NOT-SEND');
  });

  it('the allowlist is exactly the form fields', () => {
    expect([...CONTACT_EMAIL_FIELDS].sort()).toEqual(
      ['company', 'country', 'email', 'message', 'mwMwh', 'name', 'projectName', 'targetCod'].sort(),
    );
  });
});

describe('safeMailtoHref', () => {
  it('accepts a plain address and rejects anything else', () => {
    expect(safeMailtoHref('a@b.co')).toBe('mailto:a%40b.co');
    for (const bad of ['javascript:alert(1)', 'a@b.co" onmouseover=x', '<a@b.co>', 'not-an-email', '']) {
      expect(safeMailtoHref(bad), bad).toBe('');
    }
  });
});
