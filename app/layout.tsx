import { Suspense } from "react";
import type { Metadata } from "next";
import { Newsreader, JetBrains_Mono, Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import { RouteProgressBar } from "@/components/RouteProgressBar";
import { Providers } from "./providers";
import "./globals.css";

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LendLoop — Neighborhood Tool Shed",
  description: "Borrow what you need. Lend what you don't.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`h-full ${serif.variable} ${mono.variable} ${sans.variable}`}
    >
      <body className="h-full font-sans antialiased bg-[#F7F5F0] text-[#1C1917]">
        <Suspense fallback={null}>
          <RouteProgressBar />
        </Suspense>
        <Providers>
          <ToastProvider>{children}</ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
