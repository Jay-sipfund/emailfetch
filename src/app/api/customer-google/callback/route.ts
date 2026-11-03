
import { NextResponse } from "next/server";
import { google } from "googleapis";
import clientPromise from "@/lib/mongodb";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");

  const callbackUrl = new URL("/google-callback", url.origin);

  const response = NextResponse.redirect(callbackUrl);

  const stateCookie = request.headers
    .get("cookie")
    ?.split("; ")
    .find((item) =>
      item.startsWith("customer_google_oauth_state=")
    )
    ?.split("=")
    .slice(1)
    .join("=");

  response.cookies.set("customer_google_oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/customer-google/callback",
    maxAge: 0,
  });

  if (googleError) {
    callbackUrl.searchParams.set("error", "google_login_cancelled");
    return NextResponse.redirect(callbackUrl);
  }

  if (
    !code ||
    !returnedState ||
    !stateCookie ||
    returnedState !== stateCookie
  ) {
    callbackUrl.searchParams.set("error", "invalid_oauth_state");
    return NextResponse.redirect(callbackUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CUSTOMER_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    callbackUrl.searchParams.set("error", "missing_google_config");
    return NextResponse.redirect(callbackUrl);
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.id_token) {
      callbackUrl.searchParams.set("error", "google_identity_missing");
      return NextResponse.redirect(callbackUrl);
    }

    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: clientId,
    });

    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified) {
      callbackUrl.searchParams.set("error", "email_not_verified");
      return NextResponse.redirect(callbackUrl);
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || "";

    const db = (await clientPromise).db();

    const existingUser = await db.collection("user").findOne({
      email,
    });

    if (existingUser) {
      callbackUrl.searchParams.set("error", "email_already_registered");
      return NextResponse.redirect(callbackUrl);
    }

    // Pass the verified identity to the next page.
    // No Better Auth user is created here.
    callbackUrl.searchParams.set("email", email);
    callbackUrl.searchParams.set("name", name);

    return NextResponse.redirect(callbackUrl);
  } catch (error) {
    console.error("[CUSTOMER GOOGLE CALLBACK]", error);

    callbackUrl.searchParams.set("error", "google_auth_failed");
    return NextResponse.redirect(callbackUrl);
  }
}

