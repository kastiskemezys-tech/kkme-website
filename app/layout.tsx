import type { Metadata } from "next";
import { Cormorant, DM_Mono, Unbounded } from "next/font/google";
import { SmoothScroll } from "./providers";
import { ClarityScript } from "@/app/components/ClarityScript";
import "./globals.css";

const cormorant = Cormorant({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["400", "600"],
});

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${cormorant.variable} ${dmMono.variable} ${unbounded.variable}`}
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
          padding: '8px 16px', border: '1px solid var(--border-highlight)',
        }}>Skip to content</a>
        <SmoothScroll />
        {children}
        <ClarityScript />
      </body>
    </html>
  );
}
