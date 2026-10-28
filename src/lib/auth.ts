
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import clientPromise from "@/lib/mongodb";

export const getAuth = async () => {
  console.log("[AUTH] Initializing Better Auth...");

  try {
    const client = await clientPromise;
    console.log("[MONGODB] Connection established.");

    const db = client.db();
    console.log("[MONGODB] Database selected:", db.databaseName);

    return betterAuth({
      baseURL: process.env.BETTER_AUTH_URL,
      secret: process.env.BETTER_AUTH_SECRET,
      database: mongodbAdapter(db, { client }),

      emailAndPassword: {
        enabled: true,
      },

      user: {
        additionalFields: {
          role: {
            type: "string",
            required: false,
            defaultValue: "user",
            input: false,
          },
        },
      },
    });
  } catch (error) {
    console.error("[AUTH] Initialization failed:", error);
    throw error;
  }
};
