import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy - CampaignCue",
  description:
    "How CampaignCue handles Instagram account data, webhook payloads, billing data, and customer campaign information.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      description="CampaignCue helps businesses send Meta-compliant private replies when people comment on connected Instagram posts or reels."
      updatedAt="May 24, 2026"
    >
      <section>
        <h2 className="text-xl font-bold text-white">Data We Collect</h2>
        <p className="mt-3">
          We collect account email addresses for authentication, workspace and
          billing metadata, connected Instagram account identifiers, encrypted
          Instagram access tokens, automation settings, webhook payloads,
          comments needed to process automations, delivery logs, and operational
          diagnostics.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white">How We Use Data</h2>
        <p className="mt-3">
          We use this data to authenticate users, connect Instagram
          integrations, match comment keywords, send private replies through the
          official Meta APIs, enforce plan limits, process billing, prevent
          duplicate sends, troubleshoot failures, and protect the service.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white">Instagram And Meta Data</h2>
        <p className="mt-3">
          CampaignCue does not ask for Instagram passwords, scrape Instagram, or
          use browser automation. Instagram tokens are encrypted at rest and are
          used only to perform actions authorized by the connected business
          account.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white">Subprocessors</h2>
        <p className="mt-3">
          The production service may use hosting, database, Redis queue, email,
          billing, and observability providers such as Vercel, Railway,
          PostgreSQL, Redis, Resend, and Stripe. These providers process data
          only as needed to run the service.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white">Retention And Deletion</h2>
        <p className="mt-3">
          Customers can disconnect Instagram from settings, which removes the
          stored Instagram connection and stops automations. For account or data
          deletion, follow the Data Deletion page linked from the footer.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white">Contact</h2>
        <p className="mt-3">
          For privacy questions, contact the repository owner through GitHub or
          the support email configured for the hosted CampaignCue service.
        </p>
      </section>
    </LegalShell>
  );
}
