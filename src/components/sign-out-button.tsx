
"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const result = await authClient.signOut();

    if (!result.error) {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <button
      onClick={handleSignOut}
      className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
    >
      Sign Out
    </button>
  );
}
