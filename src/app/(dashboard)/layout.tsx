import { redirect } from "next/navigation";
import { getActiveBusiness, getUserMemberships, requireAuth } from "@/lib/auth-helpers";
import AppShell from "@/components/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const activeContext = await getActiveBusiness();
  const memberships = await getUserMemberships(user.id);

  if (!activeContext) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-4">
          <h1 className="text-xl font-bold text-white">No Active Business Found</h1>
          <p className="text-sm text-slate-400">
            You do not currently belong to any business organization.
          </p>
          <a
            href="/signup"
            className="inline-block py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition"
          >
            Create a Business
          </a>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      user={user}
      activeBusiness={activeContext.business}
      role={activeContext.role}
      memberships={memberships}
    >
      {children}
    </AppShell>
  );
}
