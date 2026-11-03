
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function VerifyEmailPage() {
    const router = useRouter();

    const [otp, setOtp] = useState("");
    const [otpSent, setOtpSent] = useState(false);
    const [verified, setVerified] = useState(false);

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [countdown, setCountdown] = useState(0);
    const [loading, setLoading] = useState(false);
    const [registering, setRegistering] = useState(false);
    const [gmailSearching, setGmailSearching] = useState(false);

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");

    const gmailPollStarted = useRef(false);

    // Default to manual signup for older pendingSignup records.
    const [signupMethod, setSignupMethod] = useState<"manual" | "google">("manual");

    // Load pending signup details.
    useEffect(() => {
        try {
            const pendingSignup = sessionStorage.getItem("pendingSignup");

            if (!pendingSignup) {
                setError("Signup details not found. Please start again.");
                return;
            }

            const details = JSON.parse(pendingSignup);

            setName(details.name || "");
            setEmail(details.email || "");

            setSignupMethod(
                details.signupMethod === "google" ? "google" : "manual"
            );
        } catch {
            setError("Unable to retrieve signup details.");
        }
    }, []);

    // 60-second resend countdown.
    useEffect(() => {
        if (countdown <= 0) return;

        const timer = setTimeout(() => {
            setCountdown((previous) => Math.max(0, previous - 1));
        }, 1000);

        return () => clearTimeout(timer);
    }, [countdown]);

    // Retrieve OTP using the timestamp of the current OTP request.
    async function retrieveGmailOtp(requestedAt: number) {
        let attempts = 0;

        setGmailSearching(true);

        const retrieve = async (): Promise<void> => {
            attempts++;

            try {
                const response = await fetch("/api/customer-gmail/otp", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        email,
                        requestedAt,
                    }),
                });

                const data = await response.json();

                // Do not accept a response belonging to an older request.
                const currentTimestamp = Number(
                    sessionStorage.getItem("customerOtpRequestedAt")
                );

                if (currentTimestamp !== requestedAt) {
                    setGmailSearching(false);
                    return;
                }

                if (response.ok && data.found && data.otp) {
                    setOtp(data.otp);
                    setMessage("Latest OTP retrieved from Gmail successfully!");
                    setGmailSearching(false);

                    sessionStorage.removeItem("customerOtpPending");
                    return;
                }

                if (!response.ok) {
                    throw new Error(
                        data.error || "Gmail retrieval failed."
                    );
                }
            } catch (err) {
                console.error("[GMAIL OTP RETRIEVAL]", err);
            }

            const currentTimestamp = Number(
                sessionStorage.getItem("customerOtpRequestedAt")
            );

            if (currentTimestamp !== requestedAt) {
                setGmailSearching(false);
                return;
            }

            if (attempts >= 40) {
                setGmailSearching(false);
                setMessage(
                    "Automatic OTP retrieval timed out. Please enter your OTP manually."
                );

                return;
            }

            await new Promise((resolve) => setTimeout(resolve, 3000));

            return retrieve();
        };

        await retrieve();
    }

    // Automatically retrieve OTP only for Google signup.
    useEffect(() => {
        if (
            !email ||
            signupMethod !== "google" ||
            gmailPollStarted.current
        ) {
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const gmailConnected = params.get("gmail_connected");
        const gmailError = params.get("gmail_error");

        const otpPending =
            sessionStorage.getItem("customerOtpPending");

        if (!otpPending || (!gmailConnected && !gmailError)) {
            return;
        }

        window.history.replaceState({}, "", "/verify-email");

        setOtpSent(true);

        if (gmailError) {
            setMessage(
                "Gmail connection was unsuccessful. Please enter your OTP manually."
            );

            sessionStorage.removeItem("customerOtpPending");
            sessionStorage.removeItem("customerOtpRequestedAt");
            return;
        }

        const requestedAt = Number(
            sessionStorage.getItem("customerOtpRequestedAt")
        );

        if (!Number.isFinite(requestedAt) || requestedAt <= 0) {
            setMessage(
                "OTP request time not found. Please request a new OTP."
            );
            return;
        }

        gmailPollStarted.current = true;

        sessionStorage.setItem("customerGmailConnected", "true");

        setMessage(
            "Gmail connected. Looking for your latest verification OTP..."
        );

        retrieveGmailOtp(requestedAt);
    }, [email, signupMethod]);

    // Send or resend OTP.
    async function sendOtp() {
        if (!email.trim()) {
            setError("Please enter your email address.");
            return;
        }

        setLoading(true);
        setError("");
        setMessage("");

        try {
            // Record the timestamp immediately before requesting a new OTP.
            const requestedAt = Date.now();

            const response = await fetch("/api/otp/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.retryAfterSeconds) {
                    setCountdown(data.retryAfterSeconds);
                }

                throw new Error(data.error || "Unable to send OTP.");
            }

            setOtpSent(true);
            setOtp("");
            setCountdown(data.cooldownSeconds || 60);

            // MANUAL SIGNUP: No Google redirect or Gmail access.
            if (signupMethod === "manual") {
                sessionStorage.removeItem("customerOtpPending");
                sessionStorage.removeItem("customerOtpRequestedAt");

                setMessage(
                    "OTP sent successfully. Please check your email and enter the OTP manually."
                );

                return;
            }

            // GOOGLE SIGNUP: Save timestamp for Gmail OTP retrieval.
            sessionStorage.setItem(
                "customerOtpRequestedAt",
                String(requestedAt)
            );

            sessionStorage.setItem("customerOtpPending", "true");

            const gmailAlreadyConnected =
                sessionStorage.getItem("customerGmailConnected") === "true";

            if (gmailAlreadyConnected) {
                await retrieveGmailOtp(requestedAt);
                return;
            }

            setMessage("OTP sent. Connecting to Gmail...");

            window.location.href =
                `/api/customer-gmail/connect?email=${encodeURIComponent(
                    email.trim().toLowerCase()
                )}`;
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

    // Verify OTP.
    async function verifyOtp() {
        setLoading(true);
        setError("");
        setMessage("");

        try {
            const response = await fetch("/api/otp/verify", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, otp }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "OTP verification failed.");
            }

            setVerified(true);
            setMessage("Your email has been verified successfully!");

            sessionStorage.removeItem("customerOtpPending");
            sessionStorage.removeItem("customerOtpRequestedAt");
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

    // Create Better Auth account after OTP verification.
    async function handleRegistration() {
        setError("");
        setMessage("");

        if (!name.trim()) {
            setError("Your name is missing. Please start signup again.");
            return;
        }

        if (password.length < 8) {
            setError("Password must contain at least 8 characters.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setRegistering(true);

        try {
            const result = await authClient.signUp.email({
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password,
            });

            if (result.error) {
                throw new Error(
                    result.error.message || "Account creation failed."
                );
            }

            const sessionResult = await authClient.getSession();

            if (sessionResult.error || !sessionResult.data?.user) {
                setMessage(
                    "Account created successfully. Please sign in to continue."
                );

                sessionStorage.removeItem("pendingSignup");
                sessionStorage.removeItem("customerOtpPending");
                sessionStorage.removeItem("customerOtpRequestedAt");
                sessionStorage.removeItem("customerGmailConnected");

                setTimeout(() => {
                    router.replace("/login");
                }, 1500);

                return;
            }

            sessionStorage.removeItem("pendingSignup");
            sessionStorage.removeItem("customerOtpPending");
            sessionStorage.removeItem("customerOtpRequestedAt");
            sessionStorage.removeItem("customerGmailConnected");

            router.replace("/dashboard");
        } catch (err) {
            console.error("[SIGNUP REGISTRATION]", err);

            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to create your account. Please try again."
            );
        } finally {
            setRegistering(false);
        }
    }

    const formattedCountdown =
        `00:${String(countdown).padStart(2, "0")}`;

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">

                <div className="mb-7 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl">
                        {verified ? "✓" : "✉️"}
                    </div>

                    <h1 className="text-2xl font-bold text-slate-900">
                        {verified
                            ? "Complete your registration"
                            : "Verify your email"}
                    </h1>

                    <p className="mt-2 text-sm text-slate-500">
                        {verified
                            ? "Create your password to finish setting up your SIPFUND account."
                            : "Verify your email address to continue with SIPFUND."}
                    </p>
                </div>

                {!verified ? (
                    <>
                        <div className="space-y-2">
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Email address
                            </label>

                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    setOtpSent(false);
                                    setOtp("");
                                    setCountdown(0);
                                    setError("");
                                    setMessage("");
                                    sessionStorage.removeItem("customerOtpPending");
                                    sessionStorage.removeItem("customerOtpRequestedAt");
                                }}
                                disabled={loading || otpSent}
                                placeholder="Enter your email address"
                                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
                            />

                            {!otpSent && (
                                <button
                                    type="button"
                                    onClick={sendOtp}
                                    disabled={loading || !email.trim()}
                                    className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {loading ? "Sending..." : "Send OTP"}
                                </button>
                            )}
                        </div>

                        {otpSent && (
                            <div className="mt-6 space-y-4">
                                <p className="text-sm text-slate-600">
                                    We've sent a six-digit verification code to{" "}
                                    <strong className="break-all text-slate-900">
                                        {email}
                                    </strong>
                                </p>

                                {gmailSearching && (
                                    <p className="text-center text-sm text-emerald-700">
                                        Checking your Gmail inbox for the latest OTP...
                                    </p>
                                )}

                                <div className="space-y-2">
                                    <label
                                        htmlFor="otp"
                                        className="block text-sm font-medium text-slate-700"
                                    >
                                        Enter verification code
                                    </label>

                                    <input
                                        id="otp"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        value={otp}
                                        onChange={(e) =>
                                            setOtp(
                                                e.target.value
                                                    .replace(/\D/g, "")
                                                    .slice(0, 6)
                                            )
                                        }
                                        placeholder="Enter 6-digit OTP"
                                        className="w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-xl font-semibold tracking-[0.5em] outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={verifyOtp}
                                    disabled={loading || otp.length !== 6}
                                    className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {loading ? "Verifying..." : "Verify OTP"}
                                </button>

                                <div className="flex items-center justify-center gap-1 text-sm">
                                    {countdown > 0 ? (
                                        <p className="text-slate-500">
                                            Resend OTP in{" "}
                                            <span className="font-semibold text-slate-800">
                                                {formattedCountdown}
                                            </span>
                                        </p>
                                    ) : (
                                        <>
                                            <span className="text-slate-500">
                                                Didn't receive the code?
                                            </span>

                                            <button
                                                type="button"
                                                onClick={sendOtp}
                                                disabled={loading}
                                                className="font-semibold text-emerald-700 hover:underline disabled:opacity-50"
                                            >
                                                Resend OTP
                                            </button>
                                        </>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setOtpSent(false);
                                        setOtp("");
                                        setCountdown(0);
                                        setMessage("");
                                        setError("");
                                        sessionStorage.removeItem("customerOtpPending");
                                        sessionStorage.removeItem("customerOtpRequestedAt");
                                    }}
                                    disabled={loading}
                                    className="w-full text-center text-xs text-slate-500 hover:text-slate-800"
                                >
                                    Change email address
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="space-y-5">
                        <div className="rounded-lg bg-emerald-50 p-4 text-center">
                            <div className="text-2xl text-emerald-600">✓</div>

                            <p className="mt-1 text-sm font-semibold text-emerald-800">
                                Email verified successfully!
                            </p>

                            <p className="mt-1 break-all text-sm text-emerald-700">
                                {email}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label
                                htmlFor="password"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Create password
                            </label>

                            <input
                                id="password"
                                type="password"
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter password (minimum 8 characters)"
                                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                            />
                        </div>

                        <div className="space-y-2">
                            <label
                                htmlFor="confirmPassword"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Confirm password
                            </label>

                            <input
                                id="confirmPassword"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) =>
                                    setConfirmPassword(e.target.value)
                                }
                                placeholder="Re-enter your password"
                                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={handleRegistration}
                            disabled={
                                registering ||
                                !password ||
                                !confirmPassword
                            }
                            className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {registering
                                ? "Creating account..."
                                : "Create SIPFUND Account"}
                        </button>
                    </div>
                )}

                {message && (
                    <p
                        role="status"
                        className="mt-5 rounded-lg bg-emerald-50 p-3 text-center text-sm text-emerald-800"
                    >
                        {message}
                    </p>
                )}

                {error && (
                    <p
                        role="alert"
                        className="mt-5 rounded-lg bg-red-50 p-3 text-center text-sm text-red-700"
                    >
                        {error}
                    </p>
                )}

                <p className="mt-8 text-center text-xs text-slate-400">
                    Secure email verification · SIPFUND
                </p>
            </div>
        </main>
    );
}
