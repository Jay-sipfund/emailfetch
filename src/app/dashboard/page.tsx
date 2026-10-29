
"use client";

import { useEffect, useState } from "react";
import SignOutButton from "../../components/sign-out-button";

type RegistrationData = {
    ucc: string | null;
    registrationLink: string | null;
    status: string;
};

export default function UserDashboard() {
    const [data, setData] = useState<RegistrationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

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

    return (
        <main className="min-h-screen bg-slate-50 p-6 md:p-10">
            <div className="mx-auto max-w-5xl">
                <header className="mb-8 flex justify-around">
                    <p className="text-sm font-semibold text-blue-700">
                        EMAILFETCH · USER
                    </p>
                    <h1 className="mt-2 text-3xl font-bold text-slate-900">
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
                        <p className="mt-3 text-sm text-red-600">{error}</p>
                    ) : data?.registrationLink ? (
                        <p className="mt-3 text-sm text-green-700">
                            Your registration link is ready.
                        </p>
                    ) : (
                        <p className="mt-3 text-sm text-slate-600">
                            Your NSE registration link has not arrived yet.
                        </p>
                    )}

                    {data?.registrationLink ? (
                        <a
                            href={data.registrationLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-5 inline-flex items-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                            Complete NSE Registration
                            <span className="ml-2" aria-hidden="true">↗</span>
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
                    Your dashboard displays registration details assigned to your account.
                </p>
            </div>
        </main>
    );
}
