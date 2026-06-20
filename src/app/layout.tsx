import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { WebBackgroundLab } from "@/components/WebBackgroundLab";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Weaver",
  description:
    "Your visual taste, woven together — a personal aggregator of images you've engaged with across your accounts.",
  applicationName: "Weaver",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Weaver" },
};

// Responsive + PWA: cover the notch, lock initial scale sanely (still zoomable for a11y).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* a11y: skip link so keyboard users bypass the header straight to the feed. */}
        <a href="#feed" className="sr-only focusable">
          Skip to feed
        </a>
        <WebBackgroundLab />
        {children}
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
