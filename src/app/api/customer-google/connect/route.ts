
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { randomBytes } from "crypto";

export async function GET() {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CUSTOMER_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        { error: "Customer Google OAuth configuration is missing." },
        { status: 500 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const state = randomBytes(32).toString("hex");

    const authorizationUrl = oauth2Client.generateAuthUrl({
      access_type: "online",
      prompt: "select_account",
      scope: ["openid", "email", "profile"],
      state,
    });

    const response = NextResponse.redirect(authorizationUrl);

    response.cookies.set("customer_google_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/customer-google/callback",
      maxAge: 600,
    });

    return response;
  } catch (error) {
    console.error("[CUSTOMER GOOGLE CONNECT]", error);

    return NextResponse.json(
      { error: "Unable to connect Google account." },
      { status: 500 }
    );
  }
}
