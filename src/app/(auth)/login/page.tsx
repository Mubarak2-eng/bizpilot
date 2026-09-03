import { Suspense } from "react";
import LoginForm from "@/components/login-form";

export const metadata = {
  title: "Login | BizPilot AI",
  description: "Sign in to your BizPilot AI multi-tenant business account",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-mesh-dark flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-white text-xs font-mono">Loading authentication...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
