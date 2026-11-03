
import { NextResponse } from "next/server";
import { randomInt, createHash } from "crypto";
import clientPromise from "@/lib/mongodb";

const RESEND_COOLDOWN_SECONDS = 60;
const OTP_EXPIRY_MINUTES = 5;

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check required Brevo configuration.
    if (
      !process.env.BREVO_API_KEY ||
      !process.env.BREVO_SENDER_EMAIL ||
      !process.env.BREVO_SENDER_NAME
    ) {
      console.error("[OTP] Brevo environment variables are missing.");

      return NextResponse.json(
        { error: "Email service is not configured" },
        { status: 500 }
      );
    }

    const db = (await clientPromise).db();
    const otpCollection = db.collection("emailOtps");
    // Check whether this email is already registered.
    const existingUser = await db.collection("user").findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error: "This email is already registered. Please sign in.",
        },
        { status: 409 }
      );
    }
    // Check whether the user requested an OTP within the last 60 seconds.
    const existingOtp = await otpCollection.findOne({
      email: normalizedEmail,
    });

    if (existingOtp?.createdAt) {
      const elapsedSeconds = Math.floor(
        (Date.now() - new Date(existingOtp.createdAt).getTime()) / 1000
      );

      const remainingSeconds =
        RESEND_COOLDOWN_SECONDS - elapsedSeconds;

      if (remainingSeconds > 0) {
        return NextResponse.json(
          {
            error: "Please wait before requesting another OTP.",
            retryAfterSeconds: remainingSeconds,
          },
          { status: 429 }
        );
      }
    }

    // Generate a new six-digit OTP.
    const otp = randomInt(100000, 1000000).toString();

    const otpHash = createHash("sha256")
      .update(otp)
      .digest("hex");

    // Send the OTP through Brevo.
    const brevoResponse = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": process.env.BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: {
            name: process.env.BREVO_SENDER_NAME,
            email: process.env.BREVO_SENDER_EMAIL,
          },
          to: [{ email: normalizedEmail }],
          subject: "Your SIPFUND email verification OTP",
          htmlContent: `
            <div style="font-family: Arial, sans-serif;">
              <h2>Email Verification</h2>
              <p>Your verification OTP is:</p>
              <h1 style="letter-spacing: 5px;">${otp}</h1>
              <p>This OTP is valid for ${OTP_EXPIRY_MINUTES} minutes.</p>
              <p>Please do not share this OTP with anyone.</p>
            </div>
          `,
        }),
      }
    );

    if (!brevoResponse.ok) {
      const errorDetails = await brevoResponse.text();

      console.error("[BREVO] Email sending failed:", errorDetails);

      return NextResponse.json(
        { error: "Unable to send verification email" },
        { status: 502 }
      );
    }

    // Store the new OTP only after Brevo accepts the email.
    // This replaces the previous OTP, making it invalid.
    const now = new Date();

    await otpCollection.updateOne(
      { email: normalizedEmail },
      {
        $set: {
          otpHash,
          createdAt: now,
          expiresAt: new Date(
            now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000
          ),
          verified: false,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      message: existingOtp
        ? "A new OTP has been sent successfully."
        : "OTP sent successfully.",
      cooldownSeconds: RESEND_COOLDOWN_SECONDS,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });
  } catch (error) {
    console.error("[OTP SEND] Error:", error);

    return NextResponse.json(
      { error: "Something went wrong while sending OTP" },
      { status: 500 }
    );
  }
}
