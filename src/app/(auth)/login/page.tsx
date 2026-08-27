import { Suspense } from "react";
import LoginForm from "@/components/login-form";

export const metadata = {
  title: "Login | BizPilot AI",
  description: "Sign in to your BizPilot AI multi-tenant business account",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-white text-sm">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
