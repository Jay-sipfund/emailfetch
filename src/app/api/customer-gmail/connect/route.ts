
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { randomBytes } from "crypto";
import clientPromise from "@/lib/mongodb";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get("email")?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Customer email is required." },
        { status: 400 }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_CUSTOMER_GMAIL_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        { error: "Customer Gmail OAuth configuration is missing." },
        { status: 500 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const existingConnection = await db
      .collection("customerGmailConnections")
      .findOne({
        signupEmail: email,
        gmailAddress: email,
        refreshToken: { $exists: true, $ne: "" },
      });

    if (existingConnection) {
      return NextResponse.redirect(
        new URL("/verify-email?gmail_connected=1", url.origin)
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const state = randomBytes(32).toString("hex");

    const authorizationUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent select_account",
      scope: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      state,
    });

    const response = NextResponse.redirect(authorizationUrl);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/api/customer-gmail/callback",
      maxAge: 600,
    };

    response.cookies.set(
      "customer_gmail_oauth_state",
      state,
      cookieOptions
    );

    response.cookies.set(
      "customer_gmail_signup_email",
      email,
      cookieOptions
    );

    return response;
  } catch (error) {
    console.error("[CUSTOMER GMAIL CONNECT]", error);

    return NextResponse.json(
      { error: "Unable to connect customer Gmail." },
      { status: 500 }
    );
  }
}
