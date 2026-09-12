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
  metadataBase: new URL('https://bizpilot.ng'),
  title: {
    default: 'BizPilot AI — The Autonomous Business Operating System for African Enterprises',
    template: '%s | BizPilot AI'
  },
  description: 'BizPilot AI is a multi-tenant AI business operating system for African & global SMEs. Manage inventory, POS sales, customers, invoices, expenses, and WhatsApp automation — all in one platform.',
  keywords: ['business management', 'POS Nigeria', 'inventory management Nigeria', 'AI business assistant', 'WhatsApp sales bot', 'African SME software', 'retail management', 'BizPilot'],
  openGraph: {
    title: 'BizPilot AI — Autonomous Business Operating System',
    description: 'Inventory intelligence, POS terminal, WhatsApp automation, and AI copilot for African & global businesses.',
    url: 'https://bizpilot.ng',
    siteName: 'BizPilot AI',
    locale: 'en_NG',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BizPilot AI — Autonomous Business Operating System',
    description: 'Inventory intelligence, POS terminal, WhatsApp automation, and AI copilot for African & global businesses.',
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    other: {
      'facebook-domain-verification': [
        'sw16bgaj1th9eei2llcrdi5x3ue4i0',
        '5539k8z3irg1xz06mmmfsleqot68ba',
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
        <meta name="facebook-domain-verification" content="sw16bgaj1th9eei2llcrdi5x3ue4i0" />
        <meta name="facebook-domain-verification" content="5539k8z3irg1xz06mmmfsleqot68ba" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'BizPilot AI',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              url: 'https://bizpilot.ng',
              description: 'Multi-tenant AI business operating system for African & global SMEs.',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'NGN',
              },
            })
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-[#050711] text-slate-900 dark:text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-900 dark:selection:text-indigo-200 antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
