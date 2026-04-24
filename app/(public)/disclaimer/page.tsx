import type { Metadata } from "next";

import { LegalPage } from "@/components/public/legal-page";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "Important limitations and responsibility notices for AI-generated translator outputs on What Type Of | Translator.",
};

export default async function DisclaimerPage() {
  const settings = await getAppSettings();

  return (
    <div className="relative overflow-x-hidden">
      <Navbar platformName={settings.platformName} />
      <LegalPage
        title="Disclaimer"
        intro="AI-generated content can be useful for drafting, but it is not a substitute for professional judgment."
        lastUpdated="April 22, 2026"
      >
        <section>
          <h2>Informational Use</h2>
          <p>
            Translator outputs are provided for informational and drafting purposes only. They should not be considered
            legal, financial, medical, or regulatory advice.
          </p>
        </section>

        <section>
          <h2>No Guaranteed Accuracy</h2>
          <p>
            AI outputs may include factual inaccuracies, incomplete context, or unintended tone shifts. You are
            responsible for validating any generated content before publication or operational use.
          </p>
        </section>

        <section>
          <h2>Professional and Compliance Use</h2>
          <p>
            If your use case is high-stakes or regulated, you must apply an appropriate review process and, when
            necessary, consult qualified professionals.
          </p>
        </section>

        <section>
          <h2>Third-Party Dependencies</h2>
          <p>
            Some functionality depends on third-party providers and infrastructure. Availability, response quality, and
            behavior may vary over time based on those services.
          </p>
        </section>
      </LegalPage>
      <Footer platformName={settings.platformName} />
    </div>
  );
}
