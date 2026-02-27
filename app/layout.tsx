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

const SITE_DESCRIPTION =
  "KKME builds infrastructure Europe actually needs — energy storage, grid capacity, compute, the physical layer underneath everything. Operating in Baltic and Nordic markets where the bottlenecks are real and most people are still waiting for someone else to go first. New technologies get used when they work, not when they're fashionable. The thesis compounds. The assets grow.";

export const metadata: Metadata = {
  title: "KKME",
  description: SITE_DESCRIPTION,
  openGraph: {
    title: "KKME",
    description: SITE_DESCRIPTION,
    url: "https://kkme.eu",
    siteName: "KKME",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "KKME",
    description: SITE_DESCRIPTION,
  },
  alternates: {
    canonical: "https://kkme.eu",
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
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
