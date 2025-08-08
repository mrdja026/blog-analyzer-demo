import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "mrdjanb.net — Full‑Stack Engineer",
  description:
    "mrdjanb.net — 10 YOE full‑stack engineer. Modern, performant, human‑centered software.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased bg-[#0b0f14] text-[#e7edf4] min-h-screen`}>
        <header className="fixed top-4 left-1/2 -translate-x-1/2 z-20">
          <nav className="flex items-center gap-4 px-4 py-2 rounded-full border border-white/10 bg-white/[0.06] backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
            <Link href="/" className="font-semibold tracking-tight hover:text-white">
              mrdjanb<span className="text-[#6ae3ff]">.net</span>
            </Link>
            <span className="h-5 w-px bg-white/15 mx-1" />
            <Link href="/demo" className="text-sm text-[#a8b3c4] hover:text-[#e7edf4]">Demo</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
