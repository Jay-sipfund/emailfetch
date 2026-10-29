"use client";

import { useEffect, useState } from "react";
import SignOutButton from "../../components/sign-out-button";

type RegistrationData = {
    ucc: string | null;
    registrationLink: string | null;
    status: string;
    emailReceivedAt: string | Date | null;
    expiresAt: string | Date | null;
};

function formatCountdown(milliseconds: number) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function UserDashboard() {
    const [data, setData] = useState<RegistrationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [currentTime, setCurrentTime] = useState<number | null>(null);
    useEffect(() => {
        setCurrentTime(Date.now());

        const timer = window.setInterval(() => {
            setCurrentTime(Date.now());
        }, 1000);

        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        async function fetchRegistration() {
            try {
                const response = await fetch("/api/user/nse-registration");

                if (!response.ok) {
                    throw new Error("Unable to load registration details.");
                }

                const result: RegistrationData = await response.json();
                setData(result);
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Something went wrong."
                );
            } finally {
                setLoading(false);
            }
        }

        fetchRegistration();
    }, []);

    const expiryTime = data?.expiresAt
        ? new Date(data.expiresAt).getTime()
        : null;

    const hasValidExpiry =
        expiryTime !== null && Number.isFinite(expiryTime);

    const isExpired =
        hasValidExpiry &&
        currentTime !== null &&
        currentTime >= expiryTime!;

    const remainingTime =
        hasValidExpiry && currentTime !== null
            ? Math.max(0, expiryTime! - currentTime)
            : 0;
    const canRegister =
        Boolean(data?.registrationLink) &&
        hasValidExpiry &&
        !isExpired;

    return (
        <main className="min-h-screen bg-slate-50 p-6 md:p-10">
            <div className="mx-auto max-w-5xl">
                <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
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
                    ) : isExpired && data?.registrationLink ? (
                        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                            <p className="font-semibold text-red-800">
                                Your NSE registration link has expired.
                            </p>
                            <p className="mt-2 text-sm text-red-700">
                                Please contact your Relationship Manager (RM)
                                to request a new registration link.
                            </p>
                        </div>
                    ) : data?.registrationLink && hasValidExpiry ? (
                        <div className="mt-4">
                            <p className="text-sm text-green-700">
                                Your registration link is ready.
                            </p>

                            <p className="mt-3 text-sm text-slate-600">
                                Time remaining to complete registration:
                            </p>

                            <p
                                className="mt-1 text-2xl font-bold tabular-nums text-blue-700"
                                aria-live="off"
                            >
                                {formatCountdown(remainingTime)}
                            </p>
                        </div>
                    ) : data?.registrationLink ? (
                        <p className="mt-3 text-sm text-amber-700">
                            Your registration link is available, but its expiry
                            time is unavailable. Please contact your Relationship
                            Manager (RM) to confirm the link is valid.
                        </p>
                    ) : (
                        <p className="mt-3 text-sm text-slate-600">
                            Your NSE registration link has not arrived yet.
                        </p>
                    )}

                    {canRegister ? (
                        <a
                            href={data!.registrationLink!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-5 inline-flex items-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                            Complete NSE Registration
                            <span className="ml-2" aria-hidden="true">
                                ↗
                            </span>
                        </a>
                    ) : (
                        <button
                            type="button"
                            disabled
                            className="mt-5 inline-flex cursor-not-allowed items-center rounded-lg bg-slate-300 px-5 py-3 text-sm font-semibold text-slate-600"
                        >
                            Complete NSE Registration
                        </button>
                    )}
                </section>

                <p className="mt-6 text-sm text-slate-500">
                    Your dashboard displays registration details assigned to
                    your account.
                </p>
            </div>
        </main>
    );
}