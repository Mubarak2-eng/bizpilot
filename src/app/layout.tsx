import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BizPilot AI — Intelligent Business Operating System",
  description: "AI-powered business management, inventory, POS, and financial intelligence platform",
  verification: {
    other: {
      "facebook-domain-verification": [
        "sw16bgaj1th9eei2llcrdi5x3ue4i0",
        "5539k8z3irg1xz06mmmfsleqot68ba",
      ],
    },
  },
};

const themeScript = `
  (function() {
    try {
      var stored = localStorage.getItem('bizpilot-theme');
      var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var theme = stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'dark';
      var isDark = theme === 'dark' || (theme === 'system' && systemDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-[#050711] text-slate-900 dark:text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-900 dark:selection:text-indigo-200 antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
