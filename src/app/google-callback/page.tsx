
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [message, setMessage] = useState(
    "Verifying your Google account..."
  );

  useEffect(() => {
    const error = searchParams.get("error");
    const email = searchParams.get("email");
    const name = searchParams.get("name");

    if (error) {
      const messages: Record<string, string> = {
        google_login_cancelled: "Google sign-in was cancelled.",
        invalid_oauth_state: "Security verification failed. Please try again.",
        missing_google_config: "Google configuration is missing.",
        google_identity_missing: "Unable to retrieve Google account details.",
        email_not_verified: "Please use a verified Google email address.",
        email_already_registered:
          "This email is already registered. Please sign in.",
        google_auth_failed: "Google sign-in failed. Please try again.",
      };

      setMessage(
        messages[error] || "Something went wrong. Please try again."
      );
      return;
    }

    if (!email) {
      setMessage("Google account details are missing. Please try again.");
      return;
    }

    const verifiedEmail = email;

    async function continueSignup() {
      try {
        const response = await fetch("/api/check-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: verifiedEmail,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setMessage(data.error || "Unable to check email.");
          return;
        }

        if (data.exists) {
          setMessage(
            "This email is already registered. Please sign in."
          );
          return;
        }

      sessionStorage.setItem(
    "pendingSignup",
    JSON.stringify({
        name: name || "",
        email: verifiedEmail.toLowerCase(),
        signupMethod: "google",
    })
);

        router.replace("/verify-email");
      } catch (error) {
        console.error("[GOOGLE CALLBACK PAGE]", error);
        setMessage("Unable to continue. Please try again.");
      }
    }

    continueSignup();
  }, [searchParams, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 text-3xl">🔐</div>

        <h1 className="text-xl font-bold text-slate-900">
          Google account verification
        </h1>

        <p className="mt-3 text-sm text-slate-600">
          {message}
        </p>

        {message.includes("registered") && (
          <button
            onClick={() => router.push("/login")}
            className="mt-5 rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-700"
          >
            Go to Login
          </button>
        )}
      </div>
    </main>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          Verifying your Google account...
        </main>
      }
    >
      <GoogleCallbackContent />
    </Suspense>
  );
}
