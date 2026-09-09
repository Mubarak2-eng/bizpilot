"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { loginAction, LoginState } from "@/lib/actions/auth";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const registered = searchParams.get("registered");
  const authError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loginState, formAction, isPending] = useActionState<LoginState | undefined, FormData>(
    loginAction,
    undefined
  );

  const handleQuickFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("DemoPassword123!");
  };

  const getGeneralError = () => {
    if (loginState?.error) return loginState.error;
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
        return "Authentication failed. Please check your credentials.";
    }
  };

  const errorMessage = getGeneralError();

  return (
    <div className="w-full max-w-md p-7 sm:p-9 bg-white/95 dark:bg-[#090e24]/85 border border-slate-200 dark:border-violet-500/30 rounded-3xl shadow-xl dark:shadow-[0_0_50px_-10px_rgba(139,92,246,0.3)] backdrop-blur-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 dark:bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Branding */}
      <div className="text-center mb-7 relative z-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 p-[1.5px] shadow-md shadow-indigo-600/20 dark:shadow-[0_0_25px_rgba(99,102,241,0.4)] mb-3.5">
          <div className="w-full h-full bg-slate-900 dark:bg-[#080c1d] rounded-[14px] flex items-center justify-center font-black text-white text-xl tracking-tight">
            BP
          </div>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Sign in to BizPilot AI
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Autonomous Business Operating System
        </p>
      </div>

      {registered && (
        <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium relative z-10">
          Account created successfully! Please sign in with your credentials.
        </div>
      )}

      {errorMessage && (
        <div className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs font-medium relative z-10">
          {errorMessage}
        </div>
      )}

      {/* Email & Password Login Form */}
      <form action={formAction} className="space-y-4 relative z-10">
        <input type="hidden" name="redirectTo" value={callbackUrl} />

        <div>
          <label htmlFor="email-input" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
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
            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-violet-500 rounded-xl text-slate-900 dark:text-white text-xs placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500 transition font-mono shadow-xs"
          />
        </div>

        <div>
          <label htmlFor="password-input" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
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
            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-violet-500 rounded-xl text-slate-900 dark:text-white text-xs placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500 transition shadow-xs"
          />
        </div>

        <button
          id="submit-login-btn"
          type="submit"
          disabled={isPending}
          className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/25 dark:shadow-[0_0_25px_-4px_rgba(99,102,241,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-violet-300/30"
        >
          {isPending ? "Signing In..." : "Sign In"}
        </button>
      </form>

      {/* Quick Demo Credentials Switcher (Only in non-production) */}
      {process.env.NODE_ENV !== "production" && (
        <div className="mt-7 pt-5 border-t border-slate-200 dark:border-white/[0.08] relative z-10">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
            Quick Demo Credentials:
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleQuickFill("demo@bizpilot.test")}
              className="px-2.5 py-2 bg-slate-50 dark:bg-white/[0.04] hover:bg-emerald-50 dark:hover:bg-emerald-500/15 border border-slate-200 dark:border-white/[0.08] hover:border-emerald-400/50 rounded-xl transition text-center cursor-pointer group shadow-xs"
            >
              <span className="font-bold text-[10px] text-emerald-600 dark:text-emerald-400 block tracking-wider">OWNER</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white font-mono truncate block">demo@...</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill("admin@bizpilot.test")}
              className="px-2.5 py-2 bg-slate-50 dark:bg-white/[0.04] hover:bg-amber-50 dark:hover:bg-amber-500/15 border border-slate-200 dark:border-white/[0.08] hover:border-amber-400/50 rounded-xl transition text-center cursor-pointer group shadow-xs"
            >
              <span className="font-bold text-[10px] text-amber-600 dark:text-amber-400 block tracking-wider">ADMIN</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white font-mono truncate block">admin@...</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill("staff@bizpilot.test")}
              className="px-2.5 py-2 bg-slate-50 dark:bg-white/[0.04] hover:bg-blue-50 dark:hover:bg-blue-500/15 border border-slate-200 dark:border-white/[0.08] hover:border-blue-400/50 rounded-xl transition text-center cursor-pointer group shadow-xs"
            >
              <span className="font-bold text-[10px] text-blue-600 dark:text-blue-400 block tracking-wider">STAFF</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white font-mono truncate block">staff@...</span>
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400 relative z-10">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-semibold underline">
          Create business account
        </Link>
      </div>
    </div>
  );
}
