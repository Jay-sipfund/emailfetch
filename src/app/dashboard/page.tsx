
"use client";

import { useEffect, useState } from "react";
import SignOutButton from "../../components/sign-out-button";

type RegistrationData = {
    ucc: string | null;
    registrationLink: string | null;
    status: string;
    registrationLinkUpdatedAt: string | null;
};

const LINK_EXPIRY_SECONDS = 30;
const POLLING_INTERVAL = 5000;

export default function UserDashboard() {
    const [data, setData] = useState<RegistrationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [remainingSeconds, setRemainingSeconds] = useState(0);
    const [iframeOpen, setIframeOpen] = useState(false);

    // Fetch the latest registration details from MongoDB.
    useEffect(() => {
        let active = true;

        async function fetchRegistration() {
            try {
                const response = await fetch(
                    "/api/user/nse-registration",
                    { cache: "no-store" }
                );

                if (!response.ok) {
                    throw new Error("Unable to load registration details.");
                }

                const result: RegistrationData = await response.json();

                if (!active) return;

                setData((previous) => {
                    // Close the iframe if a different link or timestamp arrives.
                    if (
                        previous?.registrationLink !== result.registrationLink ||
                        previous?.registrationLinkUpdatedAt !==
                        result.registrationLinkUpdatedAt
                    ) {
                        setIframeOpen(false);
                    }

                    return result;
                });

                setError("");
            } catch (err) {
                if (active) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Something went wrong."
                    );
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        fetchRegistration();

        // Check for newly received NSE links every 5 seconds.
        const polling = window.setInterval(
            fetchRegistration,
            POLLING_INTERVAL
        );

        return () => {
            active = false;
            window.clearInterval(polling);
        };
    }, []);

    // Calculate the remaining time using the timestamp saved in MongoDB.
    useEffect(() => {
        if (!data?.registrationLink || !data.registrationLinkUpdatedAt) {
            setRemainingSeconds(0);
            setIframeOpen(false);
            return;
        }

        const updateTimer = () => {
            const receivedAt = new Date(
                data.registrationLinkUpdatedAt!
            ).getTime();

            // const EXPIRY_DURATION = 10 * 60 * 60 * 1000; 
            const EXPIRY_DURATION = 3 * 60 * 1000; // 3 minutes

            const expiryTime = receivedAt + EXPIRY_DURATION;

            const remaining = Math.max(
                0,
                Math.ceil((expiryTime - Date.now()) / 1000)
            );

            setRemainingSeconds(remaining);

            if (remaining <= 0) {
                setIframeOpen(false);
            }
        };

        updateTimer();

        const timer = window.setInterval(updateTimer, 1000);

        return () => window.clearInterval(timer);
    }, [data?.registrationLink, data?.registrationLinkUpdatedAt]);

    const linkIsValid =
        !!data?.registrationLink &&
        !!data?.registrationLinkUpdatedAt &&
        remainingSeconds > 0;

    function openRegistration() {
        if (linkIsValid) {
            setIframeOpen(true);
        }
    }

    function formatTime(seconds: number) {
        const minutes = Math.floor(seconds / 60);
        const remaining = seconds % 60;

        return `${String(minutes).padStart(2, "0")}:${String(
            remaining
        ).padStart(2, "0")}`;
    }

    return (
        <main className="min-h-screen bg-slate-50 p-6 md:p-10">
            <div className="mx-auto max-w-5xl">
                <header className="mb-8 flex items-center justify-between">
                    <p className="text-sm font-semibold text-blue-700">
                        EMAILFETCH · USER
                    </p>

                    <h1 className="text-3xl font-bold text-slate-900">
                        My Dashboard
                    </h1>

                    <SignOutButton />
                </header>

                <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-900">
                        NSE Registration
                    </h2>

                    {loading ? (
                        <p className="mt-3 text-sm text-slate-600">
                            Loading your registration details...
                        </p>
                    ) : error ? (
                        <p className="mt-3 text-sm text-red-600">
                            {error}
                        </p>
                    ) : !data?.registrationLink ? (
                        <p className="mt-3 text-sm text-slate-600">
                            Your NSE registration link has not arrived yet.
                        </p>
                    ) : linkIsValid ? (
                        <div className="mt-4">
                            <p className="text-sm font-medium text-green-700">
                                Your registration link is ready.
                            </p>

                            <div className="mt-4 rounded-lg bg-blue-50 p-4">
                                <p className="text-sm text-slate-700">
                                    Link expires in
                                </p>

                                <p className="mt-1 text-3xl font-bold tabular-nums text-blue-700">
                                    {formatTime(remainingSeconds)}
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                    Please complete your NSE registration
                                    before the timer expires.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-4 rounded-lg bg-red-50 p-4">
                            <p className="font-semibold text-red-700">
                                Registration link expired.
                            </p>

                            <p className="mt-1 text-sm text-red-600">
                                Please contact your RM for a new link
                                generation.
                            </p>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={openRegistration}
                        disabled={!linkIsValid}
                        className={`mt-5 inline-flex items-center rounded-lg px-5 py-3 text-sm font-semibold ${linkIsValid
                                ? "bg-blue-600 text-white hover:bg-blue-700"
                                : "cursor-not-allowed bg-slate-300 text-slate-600"
                            }`}
                    >
                        Complete NSE Registration
                    </button>
                </section>

                {iframeOpen && linkIsValid && data?.registrationLink && (
                    <section className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-200 p-4">
                            <h2 className="font-semibold text-slate-900">
                                NSE Registration
                            </h2>

                            <button
                                type="button"
                                onClick={() => setIframeOpen(false)}
                                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
                            >
                                Close
                            </button>
                        </div>

                        <iframe
                            key={data.registrationLink}
                            src={data.registrationLink}
                            title="NSE Registration"
                            className="h-[75vh] w-full border-0"
                            referrerPolicy="no-referrer"
                        />

                    </section>
                )}

                <p className="mt-6 text-sm text-slate-500">
                    Your dashboard displays registration details assigned
                    to your account.
                </p>
            </div>
        </main>
    );
}
