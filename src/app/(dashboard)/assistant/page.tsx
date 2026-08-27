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
    <AssistantChat
      business={activeContext.business}
      userRole={activeContext.role}
    />
  );
}
