
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
  const db = client.db();

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

    const alreadyProcessed = await db.collection("user").findOne({
      nseRegistrationEmailId: message.id,
    });

    if (alreadyProcessed) {
      skipped++;
      continue;
    }

    const detail = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "full",
    });

    const body = decodeHtml(
      getEmailBody(detail.data.payload ?? {})
    );

    console.log("[NSE DEBUG] Email ID:", message.id);
    console.log("[NSE DEBUG] Body preview:", body.slice(0, 1500));

    // Extract UCC with or without a period after "Code".
    const uccMatch = body.match(
      /Unique Client Code\.?\s*\(UCC\)\s*:\s*([^\r\n<]+)/i
    );

    const ucc = uccMatch?.[1]?.trim() ?? null;

    // Extract a URL with or without its protocol.
    const linkMatch = body.match(
      /Authorisation\s+Link\s*:\s*((?:https?:\/\/)?[^\s"'<>]+)/i
    );

    let registrationLink = linkMatch?.[1]?.trim() ?? null;

    if (registrationLink) {
      registrationLink = registrationLink.replace(/[),.;]+$/, "");

      // Add HTTPS when no protocol was provided.
      if (!/^https?:\/\//i.test(registrationLink)) {
        registrationLink = `https://${registrationLink}`;
      }

      // Validate the normalized URL.
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

    console.log("[NSE DEBUG] Extracted UCC:", ucc);
    console.log("[NSE DEBUG] Extracted link:", registrationLink);

    processed++;

    if (!ucc || !registrationLink) continue;

    const matchedUser = await db.collection("user").findOne({ ucc });

    if (!matchedUser) {
      console.log("[NSE DEBUG] No user found for UCC:", ucc);
      continue;
    }

    await db.collection("user").updateOne(
      { _id: matchedUser._id },
      {
        $set: {
          nseRegistrationLink: registrationLink,
          nseRegistrationStatus: "pending",
          nseRegistrationEmailId: message.id,
          nseRegistrationLinkUpdatedAt: new Date(),
        },
      }
    );

    matched++;
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
