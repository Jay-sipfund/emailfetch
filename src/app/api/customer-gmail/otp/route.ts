
import { NextResponse } from "next/server";
import { google } from "googleapis";
import clientPromise from "@/lib/mongodb";

function decodeEmailBody(data?: string | null): string {
  if (!data) return "";

  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    Math.ceil(base64.length / 4) * 4,
    "="
  );

  return Buffer.from(padded, "base64").toString("utf-8");
}

function extractMessageText(payload: any): string {
  let text = "";

  if (payload?.body?.data) {
    text += decodeEmailBody(payload.body.data) + "\n";
  }

  if (payload?.parts) {
    for (const part of payload.parts) {
      text += extractMessageText(part);
    }
  }

  return text;
}

function cleanEmailText(text: string): string {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: Request) {
  try {
    const { email, requestedAt } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Customer email is required." },
        { status: 400 }
      );
    }

    if (
      typeof requestedAt !== "number" ||
      !Number.isFinite(requestedAt) ||
      requestedAt <= 0
    ) {
      return NextResponse.json(
        { error: "Valid OTP request timestamp is required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const client = await clientPromise;
    const db = client.db();

    const connection = await db
      .collection("customerGmailConnections")
      .findOne({
        signupEmail: normalizedEmail,
        gmailAddress: normalizedEmail,
      });

    if (!connection?.refreshToken) {
      return NextResponse.json(
        { error: "Gmail is not connected." },
        { status: 403 }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_CUSTOMER_GMAIL_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        { error: "Google OAuth configuration is missing." },
        { status: 500 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    oauth2Client.setCredentials({
      refresh_token: connection.refreshToken,
    });

    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client,
    });

    // Search only emails received around the current OTP request.
    // Five-second allowance accounts for small clock differences.
    const searchAfter = Math.floor((requestedAt - 5000) / 1000);

    const messages = await gmail.users.messages.list({
      userId: "me",
      q: `after:${searchAfter}`,
      maxResults: 20,
    });

    if (!messages.data.messages?.length) {
      return NextResponse.json({
        found: false,
        message: "Waiting for the latest OTP email.",
      });
    }

    // Fetch messages and order them by Gmail's received timestamp.
    const fullMessages = await Promise.all(
      messages.data.messages.map(async (message) => {
        if (!message.id) return null;

        const result = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "full",
        });

        return result.data;
      })
    );

    const latestMessages = fullMessages
      .filter(
        (message) =>
          message !== null &&
          Number(message.internalDate || 0) >= requestedAt - 5000
      )
      .sort(
        (a, b) =>
          Number(b!.internalDate || 0) -
          Number(a!.internalDate || 0)
      );

    for (const fullMessage of latestMessages) {
      const headers = fullMessage.payload?.headers || [];

      const getHeader = (name: string) =>
        headers
          .find(
            (header: any) =>
              header.name?.toLowerCase() === name.toLowerCase()
          )
          ?.value?.toLowerCase() || "";

      const from = getHeader("From");
      const to = getHeader("To");
      const subject = getHeader("Subject");

      if (
        !from.includes("jaymentor9@12650913.brevosend.com") ||
        !to.includes(normalizedEmail) ||
        !subject.includes("your sipfund email verification otp")
      ) {
        continue;
      }

      const rawText = extractMessageText(fullMessage.payload);
      const cleanText = cleanEmailText(rawText);

      const otpMatch = cleanText.match(
        /Your\s+verification\s+OTP\s+is\s*:?\s*([0-9]{6})/i
      );

      if (otpMatch?.[1]) {
        return NextResponse.json({
          found: true,
          otp: otpMatch[1],
        });
      }
    }

    return NextResponse.json({
      found: false,
      message: "Latest OTP email not received yet or OTP could not be extracted.",
    });
  } catch (error) {
    console.error(
      "[CUSTOMER GMAIL OTP]",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      { error: "Unable to retrieve OTP from Gmail." },
      { status: 500 }
    );
  }
}
