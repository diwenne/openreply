import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service - OpenReply",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms define acceptable use for OpenReply's hosted Instagram comment-to-DM campaign service.
      </p>

      <section>
        <h2>Authorized Use</h2>
        <p>
          You may use OpenReply only with Instagram professional accounts you own or are authorized to manage. You are responsible for the campaigns, keywords, links, and messages you configure.
        </p>
      </section>

      <section>
        <h2>Platform Compliance</h2>
        <p>
          You agree to follow Meta Platform Terms, Instagram policies, applicable messaging rules, privacy laws, advertising rules, and anti-spam laws. OpenReply may rate-limit, pause, or disable campaigns that create compliance, abuse, security, or deliverability risk.
        </p>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          OpenReply depends on third-party platforms including Meta, email, hosting, database, and queue providers. We work to operate the service reliably, but uninterrupted availability is not guaranteed.
        </p>
      </section>

      <section>
        <h2>Open-Source Core</h2>
        <p>
          The public repository is MIT licensed. Hosted SaaS infrastructure, managed support, agency workflows, analytics, reports, and other paid service features may be provided separately from the open-source core.
        </p>
      </section>
    </LegalPage>
  );
}
