import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getActiveBusiness, requireAuth } from "@/lib/auth-helpers";
import AssistantChat from "@/components/assistant-chat";

export const metadata = {
  title: "AI Business Assistant | BizPilot AI",
  description: "Natural-language business intelligence and operational copilot",
};

export default async function AssistantPage() {
  const user = await requireAuth().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const activeContext = await getActiveBusiness();
  if (!activeContext) {
    redirect("/login");
  }

  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-400">Loading AI Assistant...</div>}>
      <AssistantChat
        business={activeContext.business}
        userRole={activeContext.role}
      />
    </Suspense>
  );
}
