
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const db = (await clientPromise).db();

    const existingUser = await db.collection("user").findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return NextResponse.json({
        exists: true,
        message: "This email is already registered. Please sign in.",
      });
    }

    return NextResponse.json({
      exists: false,
      message: "Email is available.",
    });
  } catch (error) {
    console.error("[CHECK EMAIL] Error:", error);

    return NextResponse.json(
      { error: "Unable to check email. Please try again." },
      { status: 500 }
    );
  }
}
