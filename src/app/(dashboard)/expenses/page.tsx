import { redirect } from "next/navigation";
import { getActiveBusiness, requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import ExpensesManager, { ExpenseItem } from "@/components/expenses-manager";

export const metadata = {
  title: "Expenses & Outflows | BizPilot AI",
  description: "Track operational expenses and category cost breakdown",
};

export default async function ExpensesPage() {
  const user = await requireAuth().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const activeContext = await getActiveBusiness();
  if (!activeContext) {
    redirect("/login");
  }

  const expenses = await prisma.expense.findMany({
    where: { businessId: activeContext.business.id },
    orderBy: { createdAt: "desc" },
  });

  const formattedExpenses: ExpenseItem[] = expenses.map((e) => ({
    id: e.id,
    category: e.category,
    description: e.description,
    amount: e.amount.toString(),
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <ExpensesManager
      business={activeContext.business}
      role={activeContext.role}
      expenses={formattedExpenses}
    />
  );
}
