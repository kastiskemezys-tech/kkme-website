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
  title: 'KKME — Baltic BESS Market Signals & Revenue Analysis',
  description:
    'Live supply/demand ratio, capacity prices, grid data, and BESS revenue model for Lithuania and the Baltic energy storage market. Updated every 4 hours.',
  openGraph: {
    title: 'KKME — Baltic BESS Market Signals & Revenue Analysis',
    description:
      'Live S/D ratio, aFRR/mFRR prices, grid capacity, and BESS IRR model for Baltic energy storage investment.',
    url: 'https://kkme.eu',
    siteName: 'KKME',
    type: 'website',
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
        <SmoothScroll />
        {children}
        <ClarityScript />
      </body>
    </html>
  );
}
