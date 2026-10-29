
import { NextResponse } from "next/server";
import { processNseEmails } from "@/lib/process-nse-emails";


export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 }
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    const result = await processNseEmails();

   return NextResponse.json(result);
  } catch (error) {
    console.error(
      "[NSE CRON] Processing failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      { error: "Failed to process NSE emails." },
      { status: 500 }
    );
  }
}
