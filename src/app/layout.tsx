import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { WeaverBackground } from "@/components/WeaverBackground";
import { SilkMotes } from "@/components/SilkMotes";
import { SmoothScroll } from "@/components/SmoothScroll";
import { MotionProvider } from "@/components/motion/MotionProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Editorial display serif for the wordmark + section headings — the single
// biggest "not-Pinterest" typographic signal. Variable font (weight range built in).
const fraunces = Fraunces({ variable: "--font-display", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Weaver",
  description:
    "Your visual taste, woven together: a personal aggregator of images you've engaged with across your accounts.",
  applicationName: "Weaver",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Weaver" },
};

// Responsive + PWA: cover the notch, lock initial scale sanely (still zoomable for a11y).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#14110c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* a11y: skip link so keyboard users bypass the header straight to the feed. */}
        <a href="#feed" className="sr-only focusable">
          Skip to feed
        </a>
        <SmoothScroll />
        <WeaverBackground />
        <SilkMotes />
        <MotionProvider>{children}</MotionProvider>
        <footer className="mt-auto border-t border-surface px-4 py-4 text-center text-xs text-muted">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
        </footer>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
