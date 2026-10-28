
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { google } from "googleapis";
import { getAuth } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";


export async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const googleError = url.searchParams.get("error");

    const response = NextResponse.redirect(
        new URL("/admin", url.origin)
    );

    const cookieHeader = request.headers.get("cookie") ?? "";
    const stateCookie = cookieHeader
        .split("; ")
        .find((item) => item.startsWith("gmail_oauth_state="))
        ?.split("=")
        .slice(1)
        .join("=");

    response.cookies.set("gmail_oauth_state", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/gmail/callback",
        maxAge: 0,
    });

    if (googleError) {
        return NextResponse.redirect(
            new URL(
                `/admin?gmail_error=${encodeURIComponent(googleError)}`,
                url.origin
            )
        );
    }

    if (!code || !returnedState || !stateCookie ||
        returnedState !== stateCookie) {
        return NextResponse.redirect(
            new URL("/admin?gmail_error=invalid_oauth_state", url.origin)
        );
    }

    const auth = await getAuth();
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session) {
        return NextResponse.redirect(
            new URL("/login?gmail_error=sign_in_required", url.origin)
        );
    }

    let userId: ObjectId;

    try {
        userId = new ObjectId(session.user.id);
    } catch {
        return NextResponse.redirect(
            new URL("/admin?gmail_error=invalid_user", url.origin)
        );
    }

    const client = await clientPromise;
    const db = client.db();

    const user = await db.collection("user").findOne(
        { _id: userId },
        { projection: { role: 1 } }
    );

    if (user?.role !== "admin") {
        return NextResponse.redirect(
            new URL("/dashboard?gmail_error=admin_required", url.origin)
        );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        return NextResponse.redirect(
            new URL("/admin?gmail_error=missing_google_config", url.origin)
        );
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

        const gmailAddress = profile.data.emailAddress;

        if (!tokens.refresh_token) {
            return NextResponse.redirect(
                new URL("/admin?gmail_error=missing_refresh_token", url.origin)
            );
        }

        await db.collection("gmailConnections").updateOne(
            { purpose: "nse-registration-mailbox" },
            {
                $set: {
                    purpose: "nse-registration-mailbox",
                    email: gmailAddress,
                    refreshToken: tokens.refresh_token,
                    scope: tokens.scope,
                    connectedBy: session.user.id,
                    connectedAt: new Date(),
                },
            },
            { upsert: true }
        );

        return NextResponse.redirect(
            new URL("/admin?gmail_connected=1", url.origin)
        );
    } catch (error) {
        console.error(
            "[GMAIL CALLBACK] OAuth exchange failed:",
            error instanceof Error ? error.message : "Unknown error"
        );

        return NextResponse.redirect(
            new URL("/admin?gmail_error=token_exchange_failed", url.origin)
        );
    }
}
