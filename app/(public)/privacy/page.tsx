import type { Metadata } from "next";

import { LegalPage } from "@/components/public/legal-page";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how What Type Of | Translator collects, uses, and protects personal data across translator discovery, usage analytics, and support workflows.",
};

export default async function PrivacyPolicyPage() {
  const settings = await getAppSettings();

  return (
    <div className="relative overflow-x-hidden">
      <Navbar platformName={settings.platformName} />
      <LegalPage
        title="Privacy Policy"
        intro="This policy explains what data we collect, why we collect it, and how we protect it when you use our translator platform."
        lastUpdated="April 22, 2026"
      >
        <section>
          <h2>Information We Collect</h2>
          <p>
            We collect account information for administrators, translator request submissions, and operational logs
            needed to keep the platform secure and reliable. This may include email addresses, request content,
            anonymized usage metrics, IP-derived hashes for abuse prevention, and technical diagnostics.
          </p>
        </section>

        <section>
          <h2>How We Use Your Information</h2>
          <p>
            Data is used to provide the service, improve translator quality, protect the platform from abuse, monitor
            system usage limits, and support admin moderation workflows. We do not use your submitted text as public
            content without your explicit permission.
          </p>
        </section>

        <section>
          <h2>AI and Third-Party Processing</h2>
          <p>
            Translation requests are processed through third-party AI providers configured by the platform operator.
            Submitted text may be sent to those providers solely for generation and response delivery. You should avoid
            submitting sensitive confidential information unless your organization has approved that use.
          </p>
        </section>

        <section>
          <h2>Data Retention</h2>
          <p>
            We retain logs and request records for security, analytics, and product improvement for a limited period
            determined by operational needs. Admins may archive or remove records where appropriate.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            We use access controls, authentication safeguards, and infrastructure-level protections to reduce risk.
            While we take reasonable security measures, no online service can guarantee absolute protection.
          </p>
        </section>

        <section>
          <h2>Your Choices</h2>
          <p>
            You may contact us to request correction or deletion of personal information tied to support or creation
            submissions, subject to legal and operational requirements.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For privacy-related questions, visit the Contact page and include &quot;Privacy Request&quot; in your
            message so we can route your inquiry quickly.
          </p>
        </section>
      </LegalPage>
      <Footer platformName={settings.platformName} />
    </div>
  );
}
