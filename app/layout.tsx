import type { Metadata, Viewport } from "next";
import { SmoothScroll } from "./providers";
import { ClarityScript } from "@/app/components/ClarityScript";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/newsreader/200.css";
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/400-italic.css";
import "./globals.css";

// Newsreader (serif editorial) and IBM Plex Mono (numbers + labels) loaded via
// @fontsource so the literal family names register globally — required by SVG
// font-family attributes and chart.js (Canvas 2D), which do not resolve
// var(--font-*) at render time.
//
// Phase 7.7g-a-3 — Unbounded removed. The broadsheet masthead wordmark is a
// PNG <img> so Unbounded had zero load-bearing consumers; all other
// --font-display sites migrated to --font-serif (editorial) or --font-mono
// (data/labels) per spec P3-1.

export const metadata: Metadata = {
  title: 'KKME — Baltic Flexibility Market Intelligence & Storage Economics',
  description:
    'Live supply/demand ratio, structural drivers, competition pressure, and reference-asset economics for Baltic energy storage. Updated every 4 hours.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'KKME — Baltic Flexibility Market Intelligence',
    description:
      'Live S/D ratio, aFRR/mFRR prices, grid capacity, and BESS IRR model for Baltic energy storage investment.',
    url: 'https://kkme.eu',
    siteName: 'KKME',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'KKME — Baltic Flexibility Market Intelligence',
    description: 'Live supply/demand ratio and reference-asset economics for Baltic energy storage.',
  },
  alternates: {
    canonical: 'https://kkme.eu',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: `
            (function(){
              try{
                var t=localStorage.getItem('theme');
                document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');
              }catch(e){
                document.documentElement.setAttribute('data-theme','dark');
              }
            })();
          `}}
        />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'KKME',
              url: 'https://kkme.eu',
              description: 'Baltic BESS and energy infrastructure signal console.',
              author: {
                '@type': 'Person',
                name: 'Kastytis Kemežys',
              },
            }),
          }}
        />
        <a href="#revenue-drivers" className="skip-to-content" style={{
          position: 'absolute', left: '-9999px', top: '8px', zIndex: 100,
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
          color: 'var(--text-primary)', background: 'var(--bg-card)',
          paddingTop: 'var(--space-xs)', paddingRight: 'var(--space-sm)', paddingBottom: 'var(--space-xs)', paddingLeft: 'var(--space-sm)', border: '1px solid var(--border-highlight)',
        }}>Skip to content</a>
        <SmoothScroll />
        {children}
        <ClarityScript />
      </body>
    </html>
  );
}
