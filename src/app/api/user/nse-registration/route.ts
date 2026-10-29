
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { getAuth } from "@/lib/auth"; import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const auth = await getAuth();

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const client = await clientPromise;
    const db = client.db("emailfetch");

    const user = await db.collection("user").findOne(
      { _id: new ObjectId(session.user.id) },
      {
        projection: {
          nseRegistrationLink: 1,
          nseRegistrationStatus: 1,
          nseRegistrationEmailId: 1,
          nseRegistrationEmailReceivedAt: 1,
          nseRegistrationLinkExpiresAt: 1,
          ucc: 1,
        },
      }
    );

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ucc: user.ucc ?? null,
      registrationLink: user.nseRegistrationLink ?? null,
      status: user.nseRegistrationStatus ?? "not_started",
      emailReceivedAt: user.nseRegistrationEmailReceivedAt ?? null,
      expiresAt: user.nseRegistrationLinkExpiresAt ?? null,
    });
  } catch (error) {
    console.error("Failed to fetch NSE registration details:", error);

    return NextResponse.json(
      { error: "Unable to fetch registration details" },
      { status: 500 }
    );
  }
}
