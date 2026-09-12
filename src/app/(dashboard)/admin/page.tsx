import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/admin-guard";
import { getPlatformOverviewStats, getPlatformUsersPaginated } from "@/lib/actions/admin";
import AdminDashboardView from "@/components/admin/admin-dashboard-view";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let adminContext;
  try {
    adminContext = await requirePlatformAdmin();
  } catch {
    // If not a platform admin, redirect to main user dashboard
    redirect("/dashboard");
  }

  const [stats, usersResult] = await Promise.all([
    getPlatformOverviewStats(),
    getPlatformUsersPaginated({ page: 1, limit: 10 }),
  ]);

  return (
    <AdminDashboardView
      initialStats={stats}
      initialUsers={usersResult.users}
      initialPagination={usersResult.pagination}
      currentUserEmail={adminContext.user.email}
    />
  );
}
