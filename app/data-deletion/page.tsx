import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Data Deletion - ManyChat Alternative",
  description:
    "How ManyChat Alternative customers can disconnect Instagram and request account or campaign data deletion.",
};

export default function DataDeletionPage() {
  return (
    <LegalShell
      title="Data Deletion"
      description="Use this page for Meta App Review and customer requests about removing ManyChat Alternative account, workspace, Instagram, and campaign data."
      updatedAt="May 24, 2026"
    >
      <section>
        <h2 className="text-xl font-bold text-white">Disconnect Instagram</h2>
        <p className="mt-3">
          Sign in, open Settings, and select Disconnect. This removes the stored
          Instagram connection token and stops campaigns from sending private
          replies for that workspace.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white">Delete Workspace Data</h2>
        <p className="mt-3">
          To delete workspace, campaign, log, webhook, billing reference, and
          operational diagnostic data, contact support from the email address
          used to sign in. Include the workspace name and the Instagram username
          connected to the workspace.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white">Verification</h2>
        <p className="mt-3">
          We may ask you to verify control of the email address or connected
          business account before deleting data. Deletion requests are processed
          as quickly as practical unless retention is required for legal,
          billing, fraud prevention, or security reasons.
        </p>
      </section>
    </LegalShell>
  );
}
