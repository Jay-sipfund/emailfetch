
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
export async function GET() {
  try {
    const auth = await getAuth();

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

const user = await db.collection("user").findOne(
  { _id: new ObjectId(session.user.id) },
  { projection: { role: 1 } }
);

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: user.role === "admin" ? "admin" : "user",
    });
  } catch (error) {
    console.error("[ME API] Failed to get user:", error);

    return NextResponse.json(
      { error: "Unable to retrieve user session" },
      { status: 500 }
    );
  }
}
