import type { Metadata } from "next";
import { Cormorant, DM_Mono, Unbounded } from "next/font/google";
import { SmoothScroll } from "./providers";
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
  title: 'KKME — Baltic BESS Signal Console',
  description:
    'Live signals for Baltic and Nordic energy storage, grid, and DC infrastructure deals. ' +
    'Baltic price separation, balancing markets, battery costs, grid connection, DC power.',
  openGraph: {
    title: 'KKME — Baltic BESS Signal Console',
    description:
      'Live signals for Baltic energy infrastructure investment. BESS, grid, DC.',
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
      className={`${cormorant.variable} ${dmMono.variable} ${unbounded.variable}`}
    >
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
      </body>
    </html>
  );
}
