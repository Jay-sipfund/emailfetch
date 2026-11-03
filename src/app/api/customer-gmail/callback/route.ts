
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

  const clearCookies = (response: NextResponse) => {
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/api/customer-gmail/callback",
      maxAge: 0,
    };

    response.cookies.set("customer_gmail_oauth_state", "", options);
    response.cookies.set("customer_gmail_signup_email", "", options);

    return response;
  };

  const redirectWithError = (error: string) => {
    callbackUrl.searchParams.set("gmail_error", error);
    return clearCookies(NextResponse.redirect(callbackUrl));
  };

  if (googleError) {
    return redirectWithError("permission_denied");
  }

  if (
    !code ||
    !returnedState ||
    !stateCookie ||
    returnedState !== stateCookie ||
    !signupEmail
  ) {
    return redirectWithError("invalid_oauth_state");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_CUSTOMER_GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return redirectWithError("missing_google_config");
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

    const gmailAddress =
      profile.data.emailAddress?.toLowerCase();

    if (!gmailAddress || gmailAddress !== signupEmail) {
      return redirectWithError("gmail_account_mismatch");
    }

    const client = await clientPromise;
    const db = client.db();

    const existingConnection = await db
      .collection("customerGmailConnections")
      .findOne({ signupEmail });

    const refreshToken =
      tokens.refresh_token || existingConnection?.refreshToken;

    if (!refreshToken) {
      return redirectWithError("missing_refresh_token");
    }

    await db.collection("customerGmailConnections").updateOne(
      { signupEmail },
      {
        $set: {
          signupEmail,
          gmailAddress,
          refreshToken,
          scope: tokens.scope,
          connectedAt: new Date(),
        },
      },
      { upsert: true }
    );

    callbackUrl.searchParams.set("gmail_connected", "1");

    return clearCookies(NextResponse.redirect(callbackUrl));
  } catch (error) {
    console.error(
      "[CUSTOMER GMAIL CALLBACK]",
      error instanceof Error ? error.message : "Unknown error"
    );

    return redirectWithError("token_exchange_failed");
  }
}
