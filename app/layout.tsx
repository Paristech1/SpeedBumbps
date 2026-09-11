import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";
import { ThemeProviderWrapper } from "@/components/providers/ThemeProviderWrapper";
import { Toaster } from "@/components/ui/sonner";

/**
 * Velocity Dark Design System Typography:
 * - Space Grotesk → "Command" typeface for headlines, ETAs, speed data
 * - Manrope → "Utility" typeface for body, labels, instructions
 */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-headline",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const viewport: Viewport = {
  themeColor: "#111319",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "SpeedBumps — Navigate Philly Bump-Free",
  description:
    "Navigate Philadelphia with smart speed bump avoidance. The Neon Navigator finds the smoothest routes across the city.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${manrope.variable} font-[var(--font-body)] antialiased bg-[#111319] text-[#e2e2eb]`}
      >
        <ThemeProviderWrapper>
          {children}
          <Toaster />
        </ThemeProviderWrapper>
      </body>
    </html>
  );
}
