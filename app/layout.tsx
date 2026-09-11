import type { Metadata } from "next";
import { Nunito_Sans, Fredoka } from "next/font/google";

import { RequestTranslatorProvider } from "@/components/providers/request-translator-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { APP_NAME, SEO_DESCRIPTION } from "@/lib/constants";
import { getAppBaseUrl } from "@/lib/env";
import { renderCustomHeadCode } from "@/lib/head-code";
import { getAppSettings } from "@/lib/settings";

import "./globals.css";

const bodyFont = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Fredoka({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

const DEFAULT_FAVICON = "/icon.svg";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAppSettings();
  const baseUrl = getAppBaseUrl();
  const platformName = settings.platformName?.trim() || APP_NAME;
  const homepageTitle = settings.homepageTitle?.trim() || "Give Your Words a Different Twist";
  const siteTitle = `${platformName} | ${homepageTitle}`;
  const faviconUrl = settings.faviconUrl || DEFAULT_FAVICON;
  const faviconVersion = settings.faviconUrl
    ? `?v=${encodeURIComponent(settings.faviconUrl)}`
    : "";

  return {
    metadataBase: baseUrl,
    title: {
      default: siteTitle,
      template: `${platformName} | %s`,
    },
    description: settings.homepageSubtitle?.trim() || SEO_DESCRIPTION,
    keywords: [
      "style translator",
      "tone converter",
      "text rewrite platform",
      "writing style transformation",
      "translator discovery",
      "SayTwist",
    ],
    openGraph: {
      title: siteTitle,
      description: settings.homepageSubtitle?.trim() || SEO_DESCRIPTION,
      type: "website",
      url: "/",
      siteName: platformName,
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: siteTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: siteTitle,
      description: settings.homepageSubtitle?.trim() || SEO_DESCRIPTION,
      images: ["/og-image.png"],
    },
    icons: {
      icon: [{ url: `${faviconUrl}${faviconVersion}`, type: faviconUrl.endsWith(".svg") ? "image/svg+xml" : "image/png" }],
      shortcut: [`${faviconUrl}${faviconVersion}`],
      apple: [`${faviconUrl}${faviconVersion}`],
    },
  };
}

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
