
import { google } from "googleapis";
import clientPromise from "@/lib/mongodb";

function decodeBase64Url(data: string): string {
  return Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf-8");
}

function getEmailBody(payload: any): string {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  for (const part of payload.parts ?? []) {
    const body = getEmailBody(part);
    if (body) return body;
  }

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  return "";
}

function decodeHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#58;/gi, ":")
    .replace(/&#x3a;/gi, ":")
    .replace(/&#40;/gi, "(")
    .replace(/&#41;/gi, ")")
    .replace(/&#x28;/gi, "(")
    .replace(/&#x29;/gi, ")");
}

export async function processNseEmails() {
  const client = await clientPromise;
  const db = client.db("emailfetch");
  const users = db.collection("user");

  const connection = await db.collection("gmailConnections").findOne({
    purpose: "nse-registration-mailbox",
  });

  if (!connection?.refreshToken) {
    throw new Error("Gmail is not connected.");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: connection.refreshToken,
  });

  const gmail = google.gmail({
    version: "v1",
    auth: oauth2Client,
  });

  const result = await gmail.users.messages.list({
    userId: "me",
    maxResults: 20,
    q: "newer_than:30d",
  });

  let processed = 0;
  let matched = 0;
  let skipped = 0;

  for (const message of result.data.messages ?? []) {
    if (!message.id) continue;

    const detail = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "full",
    });

    // Gmail internalDate is the message's received timestamp in milliseconds.
    const receivedAt = new Date(Number(detail.data.internalDate));

    if (
      !detail.data.internalDate ||
      Number.isNaN(receivedAt.getTime())
    ) {
      skipped++;
      continue;
    }

    const body = decodeHtml(
      getEmailBody(detail.data.payload ?? {})
    );

    const uccMatch = body.match(
      /Unique Client Code\.?\s*\(UCC\)\s*:\s*([^\r\n<]+)/i
    );
    const ucc = uccMatch?.[1]?.trim() ?? null;

    const linkMatch = body.match(
      /Authorisation\s+Link\s*:\s*((?:https?:\/\/)?[^\s"'<>]+)/i
    );

    let registrationLink = linkMatch?.[1]?.trim() ?? null;

    if (registrationLink) {
      registrationLink = registrationLink.replace(/[),.;]+$/, "");

      if (!/^https?:\/\//i.test(registrationLink)) {
        registrationLink = `https://${registrationLink}`;
      }

      try {
        const parsedUrl = new URL(registrationLink);

        if (
          parsedUrl.protocol !== "https:" ||
          !parsedUrl.hostname.includes(".")
        ) {
          registrationLink = null;
        }
      } catch {
        registrationLink = null;
      }
    }

    processed++;

    if (!ucc || !registrationLink) continue;

    const matchedUser = await users.findOne({ ucc });

    if (!matchedUser) {
      console.log("[NSE] No user found for UCC:", ucc);
      continue;
    }

    // Skip this email if it is already the user's saved email.
    if (matchedUser.nseRegistrationEmailId === message.id) {
      skipped++;
      continue;
    }

    // Calculate expiry from when the email was received, not when
    // this processing job happens to run.
    const expiresAt = new Date(
      receivedAt.getTime() + 10 * 60 * 60 * 1000
    );

    // Atomic timestamp comparison prevents an older email from
    // replacing a newer link, even if processing order changes.
    const updateResult = await users.updateOne(
      {
        _id: matchedUser._id,
        $or: [
          { nseRegistrationEmailReceivedAt: { $exists: false } },
          { nseRegistrationEmailReceivedAt: { $lt: receivedAt } },
        ],
      },
      {
        $set: {
          nseRegistrationLink: registrationLink,
          nseRegistrationStatus: "pending",
          nseRegistrationEmailId: message.id,
          nseRegistrationEmailReceivedAt: receivedAt,
          nseRegistrationLinkUpdatedAt: new Date(),
          nseRegistrationLinkExpiresAt: expiresAt,
        },
      }
    );

    if (updateResult.modifiedCount === 1) {
      matched++;
    } else {
      skipped++;
    }
  }

  return {
    success: true,
    message: "NSE emails processed.",
    email: connection.email,
    processed,
    matched,
    skipped,
  };
}
