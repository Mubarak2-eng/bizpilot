import { redirect } from "next/navigation";
import { getActiveBusiness, getUserMemberships, requireAuth } from "@/lib/auth-helpers";
import { isPlatformAdminUser } from "@/lib/auth/admin-guard";
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
  const isPlatformAdmin = isPlatformAdminUser(user);

  if (!activeContext) {
    return (
      <div className="min-h-screen bg-mesh-dark flex items-center justify-center p-4">
        <div className="max-w-md p-8 bg-[#090d24]/90 border border-violet-500/30 rounded-3xl text-center space-y-4 shadow-2xl backdrop-blur-xl">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mx-auto text-xl text-violet-300">
            🏢
          </div>
          <h1 className="text-xl font-black text-white">No Active Business Found</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            You do not currently belong to any business organization. Create a new business workspace to get started.
          </p>
          <a
            href="/signup"
            className="inline-block py-2.5 px-5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/30"
          >
            Create a Business Workspace
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
      isPlatformAdmin={isPlatformAdmin}
    >
      {children}
    </AppShell>
  );
}
