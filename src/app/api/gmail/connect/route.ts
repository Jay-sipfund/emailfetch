
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { google } from "googleapis";
import { getAuth } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { randomBytes } from "crypto";




export async function GET() {
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

    let userId: ObjectId;

    try {
        userId = new ObjectId(session.user.id);
    } catch {
        return NextResponse.json(
            { error: "Invalid user session." },
            { status: 403 }
        );
    }

    const client = await clientPromise;
    const db = client.db();

    const user = await db.collection("user").findOne(
        { _id: userId },
        { projection: { role: 1 } }
    );

    if (user?.role !== "admin") {
        return NextResponse.json(
            { error: "Admin access required." },
            { status: 403 }
        );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        return NextResponse.json(
            { error: "Google OAuth environment variables are missing." },
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
        access_type: "offline",
        prompt: "consent",
        scope: [
            "https://www.googleapis.com/auth/gmail.readonly",
        ],
        state,
    });

    const response = NextResponse.redirect(authorizationUrl);

    response.cookies.set("gmail_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/gmail/callback",
        maxAge: 600,
    });

    return response;
}



