import type { Metadata } from "next";

import { LegalPage } from "@/components/public/legal-page";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "Read the terms governing your use of StylePort, including acceptable use, account responsibilities, and service limitations.",
};

export default async function TermsOfUsePage() {
  const settings = await getAppSettings();

  return (
    <div className="relative overflow-x-hidden">
      <Navbar />
      <LegalPage
        title="Terms of Use"
        intro="By using this platform, you agree to these terms. If you do not agree, please stop using the service."
        lastUpdated="April 22, 2026"
      >
        <section>
          <h2>Service Scope</h2>
          <p>
            StylePort provides AI-assisted text transformation tools and translator discovery features. Outputs are
            generated automatically and may require human review before publication or business-critical use.
          </p>
        </section>

        <section>
          <h2>Acceptable Use</h2>
          <p>
            You agree not to use the service for unlawful activity, harassment, fraud, malware distribution, automated
            abuse, or attempts to bypass rate limits and safety controls.
          </p>
        </section>

        <section>
          <h2>Accounts and Access</h2>
          <p>
            Administrative areas are restricted to authorized users. You are responsible for maintaining account
            credentials and notifying the platform operator promptly if unauthorized access is suspected.
          </p>
        </section>

        <section>
          <h2>Generated Content</h2>
          <p>
            You remain responsible for content you submit and publish. AI outputs may contain errors, bias, or
            unsuitable language depending on context. Always review and verify results before relying on them.
          </p>
        </section>

        <section>
          <h2>Availability and Changes</h2>
          <p>
            We may update, suspend, or discontinue features to maintain security, performance, and legal compliance.
            We may also update these terms and will reflect updates on this page.
          </p>
        </section>

        <section>
          <h2>Limitation of Liability</h2>
          <p>
            The service is provided on an &quot;as is&quot; basis without warranties of uninterrupted availability or
            fitness for a particular purpose. To the maximum extent allowed by law, the platform operator is not
            liable for indirect or consequential losses arising from service use.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Questions about these terms can be submitted through the Contact page.
          </p>
        </section>
      </LegalPage>
      <Footer platformName={settings.platformName} />
    </div>
  );
}
