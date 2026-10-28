
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import SignOutButton from "@/components/sign-out-button";
export const instant = false;

export default async function AdminDashboard() {
    await headers();
    const auth = await getAuth();

    const session = await auth.api.getSession({
        headers: await headers(),
    });



    if (!session) {
        redirect("/login");
    }

    const client = await clientPromise;
    const db = client.db();

    let userId: ObjectId;

    try {
        userId = new ObjectId(session.user.id);
    } catch {
        redirect("/dashboard");
    }

    const user = await db.collection("user").findOne(
        { _id: userId },
        { projection: { role: 1 } }
    );

    if (user?.role !== "admin") {
        redirect("/dashboard");
    }
 
    return (
        <main className="min-h-screen bg-slate-50 p-6 md:p-10">
            <div className="mx-auto max-w-6xl">
                <header className="mb-8">
                    <p className="text-sm font-semibold text-blue-700">
                        EMAILFETCH · ADMIN
                    </p>
                  <SignOutButton />
                    <h1 className="mt-2 text-3xl font-bold text-slate-900">
                        Admin Dashboard
                    </h1>
                    <p className="mt-2 text-slate-600">
                        Manage fetched emails and customer registration links.
                    </p>
                </header>

                <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h2 className="font-semibold text-slate-900">Gmail Emails</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            Emails imported from the connected Gmail mailbox.
                        </p>
                        <p className="mt-4 text-2xl font-bold text-slate-400">0</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h2 className="font-semibold text-slate-900">Mapped Links</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            Registration links matched to customers.
                        </p>
                        <p className="mt-4 text-2xl font-bold text-slate-400">0</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h2 className="font-semibold text-slate-900">Needs Review</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            Emails that need manual customer matching.
                        </p>
                        <p className="mt-4 text-2xl font-bold text-slate-400">0</p>
                    </div>
                </section>

                <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-900">
                        Gmail Integration
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                        Gmail connection and email importing will be added next.
                    </p>
                    <a
                        href="/api/gmail/connect"
                        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        Connect Gmail
                    </a>
                </section>
            </div>
        </main>
    );
}
