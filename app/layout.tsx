import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import { RequestTranslatorProvider } from "@/components/providers/request-translator-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { APP_NAME, SEO_DESCRIPTION } from "@/lib/constants";
import { getAppBaseUrl } from "@/lib/env";
import { renderCustomHeadCode } from "@/lib/head-code";
import { getAppSettings } from "@/lib/settings";

import "./globals.css";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: getAppBaseUrl(),
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: SEO_DESCRIPTION,
  keywords: [
    "style translator",
    "tone converter",
    "text rewrite platform",
    "writing style transformation",
    "translator discovery",
  ],
  openGraph: {
    title: APP_NAME,
    description: SEO_DESCRIPTION,
    type: "website",
    url: "/",
    siteName: APP_NAME,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: APP_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: SEO_DESCRIPTION,
    images: ["/og-image.png"],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: ["/icon.svg"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getAppSettings();

  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <head>{renderCustomHeadCode(settings.customHeadCode || "")}</head>
      <body className="min-h-screen bg-page text-ink antialiased">
        <ToastProvider>
          <RequestTranslatorProvider>{children}</RequestTranslatorProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
