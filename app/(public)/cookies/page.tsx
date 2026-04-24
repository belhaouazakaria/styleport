import type { Metadata } from "next";

import { LegalPage } from "@/components/public/legal-page";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Understand how What Type Of | Translator uses cookies and similar technologies for authentication, security, analytics, and performance.",
};

export default async function CookiesPage() {
  const settings = await getAppSettings();

  return (
    <div className="relative overflow-x-hidden">
      <Navbar platformName={settings.platformName} />
      <LegalPage
        title="Cookie Policy"
        intro="This policy explains how cookies and similar technologies are used on this website."
        lastUpdated="April 22, 2026"
      >
        <section>
          <h2>What Cookies Are</h2>
          <p>
            Cookies are small text files stored in your browser that help websites remember session state and improve
            reliability and user experience.
          </p>
        </section>

        <section>
          <h2>How We Use Cookies</h2>
          <p>
            We use essential cookies for authentication, session continuity, and security controls. We may also use
            analytics or advertising-related scripts configured by administrators through approved settings.
          </p>
        </section>

        <section>
          <h2>Third-Party Technologies</h2>
          <p>
            If analytics or advertising tools are enabled, those providers may set additional cookies in accordance
            with their own policies.
          </p>
        </section>

        <section>
          <h2>Your Controls</h2>
          <p>
            You can manage or delete cookies through browser settings. Disabling certain cookies may reduce site
            functionality, including login and personalization behaviors.
          </p>
        </section>
      </LegalPage>
      <Footer platformName={settings.platformName} />
    </div>
  );
}
