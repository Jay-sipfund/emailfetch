
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { google } from "googleapis";
import { getAuth } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

function decodeBase64Url(data: string): string {
    return Buffer.from(
        data.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
    ).toString("utf-8");
}

function extractUrls(text: string): string[] {
    const matches = text.match(/https?:\/\/[^\s"'<>]+/g) ?? [];

    return [
        ...new Set(
            matches.map((url) => url.replace(/[),.;]+$/, ""))
        ),
    ];
}

function getEmailBody(payload: {
    mimeType?: string | null;
    body?: {
        data?: string | null;
    } | null;
    parts?: Array<{
        mimeType?: string | null;
        body?: {
            data?: string | null;
        } | null;
        parts?: any[];
    }> | null;
}): string {
    if (payload.mimeType === "text/plain" && payload.body?.data) {
        return decodeBase64Url(payload.body.data);
    }

    if (payload.parts) {
        // Prefer plain text when available.
        for (const part of payload.parts) {
            if (part.mimeType === "text/plain") {
                const body = getEmailBody(part);
                if (body) return body;
            }
        }

        // Otherwise try nested parts, including HTML.
        for (const part of payload.parts) {
            const body = getEmailBody(part);
            if (body) return body;
        }
    }

    if (payload.mimeType === "text/html" && payload.body?.data) {
        return decodeBase64Url(payload.body.data);
    }

    return "";
}

function normalizeEmailBody(body: string): string {
    return body
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#46;|&period;/gi, ".")
        .replace(/&#58;|&colon;/gi, ":")
        .replace(/&#40;/gi, "(")
        .replace(/&#41;/gi, ")")
        .replace(/&#x28;/gi, "(")
        .replace(/&#x29;/gi, ")")
        .replace(/&#x2e;/gi, ".")
        .replace(/&#x3a;/gi, ":")
        .replace(/\s+/g, " ")
        .trim();
}

export async function GET() {
    try {
        const auth = await getAuth();

        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return NextResponse.json(
                { error: "Please sign in first." },
                { status: 401 }
            );
        }

        const client = await clientPromise;
        const db = client.db();

        if (!ObjectId.isValid(session.user.id)) {
            return NextResponse.json(
                { error: "Invalid user session." },
                { status: 401 }
            );
        }

        const user = await db.collection("user").findOne(
            { _id: new ObjectId(session.user.id) },
            { projection: { role: 1 } }
        );

        if (user?.role !== "admin") {
            return NextResponse.json(
                { error: "Admin access required." },
                { status: 403 }
            );
        }

        const connection = await db
            .collection("gmailConnections")
            .findOne({ purpose: "nse-registration-mailbox" });

        console.log("[GMAIL CONNECTION EMAIL]", connection?.email);

        if (!connection?.refreshToken) {
            return NextResponse.json(
                { error: "Gmail is not connected." },
                { status: 404 }
            );
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
            q: 'subject:"UCC Activation on NSE Mutual Fund Platform"',
        });

        const messages = result.data.messages ?? [];

        const emails = await Promise.all(
            messages.map(async (message) => {
                if (!message.id) return null;

                const detail = await gmail.users.messages.get({
                    userId: "me",
                    id: message.id,
                    format: "full",
                    metadataHeaders: ["Subject", "From", "Date"],
                });

                const emailHeaders =
                    detail.data.payload?.headers ?? [];

                const getHeader = (name: string) =>
                    emailHeaders.find(
                        (header) =>
                            header.name?.toLowerCase() === name.toLowerCase()
                    )?.value ?? "";

                const payload = detail.data.payload;
                const body = payload ? getEmailBody(payload) : "";
                const normalizedBody = normalizeEmailBody(body);

                // Extract UCC from the NSE email.
                // Example: Unique Client Code. (UCC) : lav123
                const uccMatch = normalizedBody.match(
                    /Unique\s+Client\s+Code\s*\.?\s*\(\s*UCC\s*\)\s*:\s*([A-Za-z0-9_-]+)/i
                );

                const ucc = uccMatch?.[1]?.trim() ?? null;

                // Extract the authorisation URL.
                const authorisationMatch = normalizedBody.match(
                    /Authorisation\s+Link\s*:\s*(https?:\/\/[^\s"'<>]+)/i
                );

                const registrationLink =
                    authorisationMatch?.[1]?.replace(/[),.;]+$/, "") ?? null;

                console.log("[NSE DEBUG] Email ID:", message.id);
                console.log("[NSE DEBUG] Extracted UCC:", ucc);
                console.log("[NSE DEBUG] Registration link:", registrationLink);

                // Find the SIPFUND customer using the extracted UCC.

                type MatchedUser = {
                    _id: ObjectId;
                    name?: string;
                    email?: string;
                    ucc?: string;
                };

                let matchedUser: MatchedUser | null = null;

                if (ucc) {
                    matchedUser = await db.collection<MatchedUser>("user").findOne(
                        { ucc },
                        {
                            projection: {
                                _id: 1,
                                name: 1,
                                email: 1,
                                ucc: 1,
                            },
                        }
                    );
                }


                // Save the NSE registration link to the matched customer.
                let updateResult = null;

                if (matchedUser && registrationLink) {
                    try {
                        const parsedUrl = new URL(registrationLink);

                        if (
                            parsedUrl.protocol === "https:" ||
                            parsedUrl.protocol === "http:"
                        ) {
                            updateResult = await db.collection("user").updateOne(
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
                        }
                    } catch {
                        console.log(
                            "[NSE DEBUG] Invalid authorisation URL:",
                            registrationLink
                        );
                    }
                }

                console.log(
                    "[NSE DEBUG] Customer matched:",
                    !!matchedUser
                );

                console.log(
                    "[NSE DEBUG] MongoDB modified:",
                    updateResult?.modifiedCount ?? 0
                );

                const urls = extractUrls(normalizedBody);

                return {
                    id: message.id,
                    subject: getHeader("Subject"),
                    from: getHeader("From"),
                    date: getHeader("Date"),
                    ucc,
                    registrationLink,
                    registrationLinks: urls,
                    matchedUser: matchedUser
                        ? {
                            id: matchedUser._id.toString(),
                            name: matchedUser.name,
                            email: matchedUser.email,
                            ucc: matchedUser.ucc,
                        }
                        : null,
                    databaseUpdated:
                        (updateResult?.matchedCount ?? 0) > 0,
                };
            })
        );

        return NextResponse.json({
            success: true,
            totalEmails: emails.filter(Boolean).length,
            emails: emails.filter(Boolean),
        });
    } catch (error) {
        console.error("[GMAIL API ERROR]", error);

        return NextResponse.json(
            { error: "Failed to fetch or process Gmail messages." },
            { status: 500 }
        );
    }
}
