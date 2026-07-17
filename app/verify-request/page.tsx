import Link from "next/link";

export const metadata = {
  title: "Check your email - ManyChat Alternative",
  description: "A sign-in link was sent to your email.",
};

export default function VerifyRequestPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">
            ManyChat Alternative
          </h1>
        </div>

        <div className="panel rounded p-8 text-center">
          <h2 className="text-lg font-semibold mb-2">Check your email</h2>
          <p className="text-sm text-muted">
            We sent you a secure sign-in link. Open it on this device to
            continue.
          </p>
          <p className="mt-6 text-sm">
            <Link href="/login" className="text-accent hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
