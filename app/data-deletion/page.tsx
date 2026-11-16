import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";

export const metadata: Metadata = {
  title: "Data Deletion - OpenReply",
};

export default function DataDeletionPage() {
  return (
    <LegalPage title="Data Deletion">
      <p>
        Use this page for Meta App Review and customer requests about removing OpenReply account, workspace, Instagram, and campaign data.
      </p>

      <section>
        <h2>Disconnect Instagram</h2>
        <p>
          Sign in, open Settings, and select Disconnect. This removes the stored Instagram connection token and stops campaigns from sending private replies for that workspace.
        </p>
      </section>

      <section>
        <h2>Delete Workspace Data</h2>
        <p>
          To delete workspace, campaign, log, webhook, billing reference, and operational diagnostic data, contact support from the email address used to sign in. Include the workspace name and the Instagram username connected to the workspace.
        </p>
      </section>

      <section>
        <h2>Verification</h2>
        <p>
          We may ask you to verify control of the email address or connected business account before deleting data. Deletion requests are processed as quickly as practical unless retention is required for legal, billing, fraud prevention, or security reasons.
        </p>
      </section>
    </LegalPage>
  );
}
