"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction, LoginState } from "@/lib/actions/auth";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const registered = searchParams.get("registered");
  const authError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, formAction, isPending] = useActionState<LoginState | undefined, FormData>(
    loginAction,
    undefined
  );

  const handleQuickFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("DemoPassword123!");
  };

  const getErrorMessage = () => {
    if (state?.error) return state.error;
    if (!authError) return null;
    switch (authError) {
      case "CredentialsSignin":
        return "Invalid email or password. Please check your credentials.";
      case "Configuration":
      case "MissingSecret":
        return "Server authentication configuration issue. Please check AUTH_SECRET.";
      case "UntrustedHost":
        return "Untrusted host header. Please access via configured domain.";
      case "MissingCSRF":
        return "Security token expired. Please submit the form again.";
      default:
        return "Invalid email or password. Please check your credentials.";
    }
  };

  const errorMessage = getErrorMessage();

  return (
    <div className="w-full max-w-md p-8 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 font-bold text-xl mb-3 border border-indigo-500/30">
          BP
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Sign in to BizPilot AI</h1>
        <p className="text-sm text-slate-400 mt-1">Multi-tenant AI business operating platform</p>
      </div>

      {registered && (
        <div className="mb-6 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
          Account created successfully! Please sign in with your credentials.
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
          {errorMessage}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="redirectTo" value={callbackUrl} />

        <div>
          <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
            Email Address
          </label>
          <input
            id="email-input"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@bizpilot.test"
            className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
            Password
          </label>
          <input
            id="password-input"
            name="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-500"
          />
        </div>

        <button
          id="submit-login-btn"
          type="submit"
          disabled={isPending}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-lg shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>

      {/* Quick Demo Credentials Switcher */}
      <div className="mt-8 pt-6 border-t border-slate-800">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Quick Demo Credentials:
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleQuickFill("demo@bizpilot.test")}
            className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition text-center cursor-pointer"
          >
            <span className="font-semibold text-emerald-400 block">OWNER</span>
            demo@...
          </button>
          <button
            type="button"
            onClick={() => handleQuickFill("admin@bizpilot.test")}
            className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition text-center cursor-pointer"
          >
            <span className="font-semibold text-amber-400 block">ADMIN</span>
            admin@...
          </button>
          <button
            type="button"
            onClick={() => handleQuickFill("staff@bizpilot.test")}
            className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition text-center cursor-pointer"
          >
            <span className="font-semibold text-blue-400 block">STAFF</span>
            staff@...
          </button>
        </div>
      </div>

      <div className="mt-6 text-center text-xs text-slate-400">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-indigo-400 hover:text-indigo-300 font-medium underline">
          Create business account
        </Link>
      </div>
    </div>
  );
}
