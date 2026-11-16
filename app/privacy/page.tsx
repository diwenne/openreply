import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/landing/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy - OpenReply",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        OpenReply helps businesses send Meta-compliant private replies when people comment on connected Instagram posts or reels.
      </p>

      <section>
        <h2>Data We Collect</h2>
        <p>
          We collect account email addresses for authentication, workspace and billing metadata, connected Instagram account identifiers, encrypted Instagram access tokens, campaign settings, webhook payloads, comments needed to process campaigns, delivery logs, and operational diagnostics.
        </p>
      </section>

      <section>
        <h2>How We Use Data</h2>
        <p>
          We use this data to authenticate users, connect Instagram integrations, match comment keywords, send private replies through the official Meta APIs, prevent duplicate sends, troubleshoot failures, and protect the service.
        </p>
      </section>

      <section>
        <h2>Instagram And Meta Data</h2>
        <p>
          OpenReply does not ask for Instagram passwords, scrape Instagram, or use browser automation. Instagram tokens are encrypted at rest and are used only to perform actions authorized by the connected business account.
        </p>
      </section>

      <section>
        <h2>Subprocessors</h2>
        <p>
          The production service may use hosting, database, Redis queue, email, and observability providers such as Vercel, Railway, PostgreSQL, Redis, and Resend. These providers process data only as needed to run the service.
        </p>
      </section>

      <section>
        <h2>Retention And Deletion</h2>
        <p>
          Customers can disconnect Instagram from settings, which removes the stored Instagram connection and stops campaigns. For account or data deletion, follow the{" "}
          <Link href="/data-deletion">Data Deletion</Link> page linked from the footer.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          For privacy questions, contact the repository owner through GitHub or the support email configured for the hosted OpenReply service.
        </p>
      </section>
    </LegalPage>
  );
}
