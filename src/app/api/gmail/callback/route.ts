
import { NextResponse } from "next/server";
import { google } from "googleapis";
import clientPromise from "@/lib/mongodb";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");

  const callbackUrl = new URL("/verify-email", url.origin);

  const cookieHeader = request.headers.get("cookie") ?? "";

  const cookies = Object.fromEntries(
    cookieHeader.split(";").filter(Boolean).map((item) => {
      const index = item.indexOf("=");
      return [
        item.slice(0, index).trim(),
        decodeURIComponent(item.slice(index + 1).trim()),
      ];
    })
  );

  const stateCookie = cookies.customer_gmail_oauth_state;
  const signupEmail = cookies.customer_gmail_signup_email;

  const response = NextResponse.redirect(callbackUrl);

  response.cookies.set("customer_gmail_oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/customer-gmail/callback",
    maxAge: 0,
  });

  response.cookies.set("customer_gmail_signup_email", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/customer-gmail/callback",
    maxAge: 0,
  });

  if (googleError) {
    callbackUrl.searchParams.set("gmail_error", "permission_denied");
    return response;
  }

  if (
    !code ||
    !returnedState ||
    !stateCookie ||
    returnedState !== stateCookie ||
    !signupEmail
  ) {
    callbackUrl.searchParams.set("gmail_error", "invalid_oauth_state");
    return response;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_CUSTOMER_GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    callbackUrl.searchParams.set("gmail_error", "missing_google_config");
    return response;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client,
    });

    const profile = await gmail.users.getProfile({
      userId: "me",
    });

    const gmailAddress = profile.data.emailAddress?.toLowerCase();

    if (!gmailAddress || gmailAddress !== signupEmail) {
      callbackUrl.searchParams.set(
        "gmail_error",
        "gmail_account_mismatch"
      );
      return response;
    }

    if (!tokens.refresh_token) {
      callbackUrl.searchParams.set(
        "gmail_error",
        "missing_refresh_token"
      );
      return response;
    }

    const client = await clientPromise;
    const db = client.db();

    await db.collection("customerGmailConnections").updateOne(
      { signupEmail },
      {
        $set: {
          signupEmail,
          gmailAddress,
          refreshToken: tokens.refresh_token,
          scope: tokens.scope,
          connectedAt: new Date(),
        },
      },
      { upsert: true }
    );

    callbackUrl.searchParams.set("gmail_connected", "1");

    return response;
  } catch (error) {
    console.error(
      "[CUSTOMER GMAIL CALLBACK]",
      error instanceof Error ? error.message : "Unknown error"
    );

    callbackUrl.searchParams.set(
      "gmail_error",
      "token_exchange_failed"
    );

    return response;
  }
}
