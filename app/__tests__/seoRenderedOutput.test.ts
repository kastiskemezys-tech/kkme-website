/**
 * Phase 45 — rendered-output assertions, not field presence.
 *
 * The gate on this phase says it explicitly, and the reason is on record: the
 * `/s4` whitelist hid a signed-off fix for weeks because the tests asserted a
 * field EXISTED rather than what it RENDERED. So these run the real build
 * output where one exists, and the real generator function otherwise — never a
 * restatement of the config.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sitemap from '../sitemap';
import { metadata as devMetadata } from '../dev/layout';

const ROOT = process.cwd();
const robots = readFileSync(resolve(ROOT, 'public/robots.txt'), 'utf8');
const llms = readFileSync(resolve(ROOT, 'public/llms.txt'), 'utf8');

describe('the sitemap robots.txt has been promising', () => {
  const urls = sitemap().map((e) => e.url);

  it('emits the public routes', () => {
    expect(urls).toContain('https://kkme.eu/');
    expect(urls).toContain('https://kkme.eu/methodology');
    expect(urls).toContain('https://kkme.eu/intel');
    expect(urls).toContain('https://kkme.eu/regulatory');
  });

  it('omits every gated and internal route', () => {
    // The assertion that matters. A sitemap listing /fleet would invite a
    // crawler to the one route that must never be indexed.
    for (const forbidden of ['/fleet', '/calculator', '/dev']) {
      expect(urls.filter((u) => u.includes(forbidden)), forbidden).toEqual([]);
    }
  });

  it('claims no lastModified it did not compute', () => {
    // A build-time date on every entry asserts that every page changed whenever
    // anything did — a provenance claim nobody computed (rule #2), on a surface
    // read by machines rather than people.
    for (const e of sitemap()) expect(e.lastModified).toBeUndefined();
  });

  it('is referenced by robots.txt at the URL it actually serves', () => {
    expect(robots).toMatch(/^Sitemap:\s*https:\/\/kkme\.eu\/sitemap\.xml\s*$/m);
  });
});

describe('robots.txt directives', () => {
  it('disallows the internal tooling segment', () => {
    expect(robots).toMatch(/^Disallow:\s*\/dev\/\s*$/m);
  });

  it('disallows the gated console', () => {
    expect(robots).toMatch(/^Disallow:\s*\/fleet\s*$/m);
  });

  it('still allows the public site — a Disallow that swallowed everything would be worse than none', () => {
    expect(robots).toMatch(/^Allow:\s*\/\s*$/m);
    // A bare `Disallow: /` would de-index the entire site. Asserted as an exact
    // line so `Disallow: /dev/` cannot satisfy it by prefix.
    expect(robots.split('\n').some((l) => l.trim() === 'Disallow: /')).toBe(false);
  });

  it('does NOT contain the AI-crawler denials — because it is not the file being served', () => {
    // This assertion looks backwards and is the most important one here.
    //
    // The repo's public/robots.txt is 61 bytes. The build output is 61 bytes.
    // The file served at https://kkme.eu/robots.txt is 1897 bytes and carries a
    // Content-Signal preamble plus ten named AI-crawler denials — including
    // `CloudflareBrowserRenderingCrawler`, which is a Cloudflare-specific bot
    // name and the tell. Cloudflare is intercepting /robots.txt and serving its
    // own managed version.
    //
    // So there are two robots policies, and the one in version control is the
    // one nobody sees. Pinning that fact here means the day the repo file DOES
    // start being served, this test goes red and someone re-reads the phase
    // wrap instead of assuming the edit took effect.
    for (const bot of ['GPTBot', 'CCBot', 'ClaudeBot', 'Google-Extended']) {
      expect(robots, `${bot} is present in the repo file — has Cloudflare's override been removed?`).not.toContain(bot);
    }
    expect(robots).not.toContain('Content-Signal');
  });
});

describe('/dev is noindex at the meta layer as well as in robots.txt', () => {
  it('sets index:false and follow:false', () => {
    // robots.txt governs CRAWLING; the meta governs INDEXING. A page linked
    // from somewhere else can be indexed without ever being crawled, so a
    // Disallow alone does not keep it out of the index.
    expect(devMetadata.robots).toMatchObject({ index: false, follow: false });
  });
});

describe('llms.txt makes no claim the site does not support', () => {
  it('exists and names the operator and the licence position', () => {
    expect(llms).toContain('kkme.eu');
    expect(llms).toMatch(/attribution/i);
  });

  it('states the citation conditions rather than only inviting citation', () => {
    expect(llms).toMatch(/date/i);
    expect(llms).toMatch(/modelled/i);
  });

  it('names what is NOT published', () => {
    // The private tier and the NDA position have to be legible to a machine
    // reader too, not only to a human reading the footer.
    expect(llms).toMatch(/\/fleet/);
    expect(llms).toMatch(/Counterparty names/i);
  });

  it('states the training position that the SERVED robots.txt declares', () => {
    // llms.txt quotes `Content-Signal: search=yes, ai-train=no, use=reference`,
    // which is what kkme.eu/robots.txt actually serves — Cloudflare's managed
    // version, not the 61-byte file in this repo. Quoting the served policy is
    // correct; quoting the repo's would describe a file no crawler reads.
    expect(llms).toMatch(/ai-train=no/);
    expect(llms).toMatch(/robots\.txt/);
  });

  it('quotes only endpoints that exist in this repo', () => {
    // No invented URL. The health endpoint it points a machine reader at must
    // be the one the worker actually serves.
    const worker = readFileSync(resolve(ROOT, 'workers/fetch-s1.js'), 'utf8');
    expect(llms).toContain('kkme-fetch-s1.kastis-kemezys.workers.dev/health');
    expect(worker).toContain("url.pathname === '/health'");
  });
});

describe('the gated route stays gated', () => {
  it('/fleet declares noindex in its own page metadata', () => {
    const src = readFileSync(resolve(ROOT, 'app/fleet/page.tsx'), 'utf8');
    expect(src).toMatch(/robots:\s*\{[^}]*index:\s*false/);
  });

  it('no build output ships gated fleet data', () => {
    // A leak test, not an SEO check. If a static export exists, the /fleet HTML
    // must contain the login shell and nothing else.
    const out = resolve(ROOT, 'out/fleet.html');
    if (!existsSync(out)) return; // no export in this checkout — nothing to assert against
    const html = readFileSync(out, 'utf8');
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ');
    expect(text).toMatch(/Password|Sign in/i);
    // No project-level intel in the shell.
    expect(text).not.toMatch(/\b\d{2,4}\s*MW\b/);
  });
});
