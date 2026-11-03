
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import clientPromise from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const { email, otp } = await request.json();

    if (
      typeof email !== "string" ||
      typeof otp !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      !/^\d{6}$/.test(otp)
    ) {
      return NextResponse.json(
        { error: "Valid email and six-digit OTP are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const otpHash = createHash("sha256").update(otp).digest("hex");

    const db = (await clientPromise).db();
    const otpCollection = db.collection("emailOtps");

    // Atomically verify only an unused, unexpired OTP.
    const result = await otpCollection.updateOne(
      {
        email: normalizedEmail,
        otpHash,
        expiresAt: { $gt: new Date() },
        verified: false,
      },
      {
        $set: {
          verified: true,
          verifiedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { error: "Invalid or expired OTP. Please try again." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("[OTP VERIFY] Error:", error);

    return NextResponse.json(
      { error: "Unable to verify OTP" },
      { status: 500 }
    );
  }
}
