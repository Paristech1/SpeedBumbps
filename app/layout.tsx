import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter_Tight, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProviderWrapper } from "@/components/providers/ThemeProviderWrapper";
import { Toaster } from "@/components/ui/sonner";

/**
 * Nocturne Velocity typography:
 * - Barlow Condensed 700 → the mast: RIGHT, WHERE, SEND, route minutes
 * - Inter Tight → UI: captions, chips, body
 * - Geist Mono → kickers: EXACT, SMOOTHEST, status readouts
 */
const mast = Barlow_Condensed({
  variable: "--font-mast",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const ui = Inter_Tight({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = Geist_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const viewport: Viewport = {
  themeColor: "#07090A",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "SpeedBumps — Navigate Philly Bump-Free",
  description:
    "Navigate Philadelphia with smart speed bump avoidance — the smoothest way across the city, block by block.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${mast.variable} ${ui.variable} ${mono.variable} font-[var(--font-ui)] antialiased bg-[#07090A] text-[#E6EAF0]`}
      >
        <ThemeProviderWrapper>
          {children}
          <Toaster />
        </ThemeProviderWrapper>
      </body>
    </html>
  );
}
