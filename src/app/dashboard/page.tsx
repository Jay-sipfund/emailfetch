
export default function UserDashboard() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-sm font-semibold text-blue-700">
            EMAILFETCH · USER
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            My Dashboard
          </h1>
          <p className="mt-2 text-slate-600">
            View your customer registration links in one place.
          </p>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700">
              <span className="text-2xl">↗</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                NSE Registration
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Your registration link will appear here after an email is
                fetched and securely matched to your account.
              </p>
              <span className="mt-4 inline-block rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                Awaiting registration link
              </span>
            </div>
          </div>
        </section>

        <p className="mt-6 text-sm text-slate-500">
          Your dashboard will show only links assigned to your account.
        </p>
      </div>
    </main>
  );
}
