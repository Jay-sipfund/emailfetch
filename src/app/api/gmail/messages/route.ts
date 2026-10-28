
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

    return [...new Set(matches.map((url) => url.replace(/[),.;]+$/, "")))];
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

                const headers = detail.data.payload?.headers ?? [];

                const getHeader = (name: string) =>
                    headers.find(
                        (header) =>
                            header.name?.toLowerCase() === name.toLowerCase()
                    )?.value ?? "";
                const payload = detail.data.payload;

                const body = payload ? getEmailBody(payload) : "";

                const uccMatch = body.match(
                    /Unique Client Code\.?\s*\(UCC\)\s*:\s*([^\r\n]+)/i
                );

                const ucc = uccMatch?.[1]?.trim() ?? null;

                const authorisationMatch = body.match(
                    /Authorisation Link\s*:\s*(https?:\/\/[^\s]+)/i
                );

                const registrationLink = authorisationMatch?.[1]?.trim() ?? null;
                let matchedUser = null;

                if (ucc) {
                    matchedUser = await db.collection("user").findOne(
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

                const urls = extractUrls(body);

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
                };

            })
        );

        return NextResponse.json({
            email: connection.email,
            count: emails.filter(Boolean).length,
            messages: emails.filter(Boolean),
        });
    } catch (error) {
        console.error(
            "[GMAIL MESSAGES] Failed:",
            error instanceof Error ? error.message : "Unknown error"
        );

        return NextResponse.json(
            { error: "Unable to fetch Gmail messages." },
            { status: 500 }
        );
    }
}
