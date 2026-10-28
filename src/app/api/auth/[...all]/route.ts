
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

export const GET = async (request: Request) => {
  const auth = await getAuth();
  return toNextJsHandler(auth).GET(request);
};

export const POST = async (request: Request) => {
  const auth = await getAuth();
  return toNextJsHandler(auth).POST(request);
};
