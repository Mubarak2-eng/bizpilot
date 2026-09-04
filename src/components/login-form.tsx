"use client";

import { useActionState, useState, useEffect, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  initiateLoginAction,
  verifyLoginPinAction,
  resendLoginPinAction,
  LoginChallengeState,
  VerifyPinState,
} from "@/lib/actions/auth";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const registered = searchParams.get("registered");
  const authError = searchParams.get("error");

  // Step 1 State: Email & Password
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step1State, step1Action, step1Pending] = useActionState<LoginChallengeState | undefined, FormData>(
    initiateLoginAction,
    undefined
  );

  // Step 2 State: PIN verification
  const [pin, setPin] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [isResending, startResendTransition] = useTransition();

  const [step2State, step2Action, step2Pending] = useActionState<VerifyPinState | undefined, FormData>(
    verifyLoginPinAction,
    undefined
  );

  // Active Challenge Data
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string>("");

  useEffect(() => {
    if (step1State?.success && step1State.challengeId) {
      setChallengeId(step1State.challengeId);
      setMaskedEmail(step1State.maskedEmail || email);
      setCooldown(step1State.cooldownSeconds || 60);
      setResendError(null);
    }
  }, [step1State, email]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleQuickFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("DemoPassword123!");
  };

  const handleResend = () => {
    if (!challengeId || cooldown > 0 || isResending) return;
    setResendError(null);
    setResendSuccess(false);

    startResendTransition(async () => {
      const res = await resendLoginPinAction(challengeId);
      if (res.success) {
        setCooldown(res.cooldownSeconds || 60);
        setResendSuccess(true);
        setTimeout(() => setResendSuccess(false), 5000);
      } else {
        setResendError(res.error || "Failed to resend code.");
      }
    });
  };

  const handleBackToCredentials = () => {
    setChallengeId(null);
    setPin("");
    setResendError(null);
  };

  const getGeneralError = () => {
    if (step1State?.error) return step1State.error;
    if (step2State?.error) return step2State.error;
    if (!authError) return null;
    switch (authError) {
      case "CredentialsSignin":
        return "Invalid email, password, or verification code.";
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
          {challengeId ? "Security Verification" : "Sign in to BizPilot AI"}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {challengeId
            ? "Enter the 6-digit code sent to your email"
            : "Autonomous Business Operating System"}
        </p>
      </div>

      {registered && !challengeId && (
        <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium relative z-10">
          Account created successfully! Please sign in with your credentials.
        </div>
      )}

      {errorMessage && (
        <div className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs font-medium relative z-10">
          {errorMessage}
        </div>
      )}

      {resendError && (
        <div className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs font-medium relative z-10">
          {resendError}
        </div>
      )}

      {resendSuccess && (
        <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium relative z-10">
          A new 6-digit verification code has been dispatched to your email!
        </div>
      )}

      {/* STEP 1: Email & Password Form */}
      {!challengeId ? (
        <form action={step1Action} className="space-y-4 relative z-10">
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
            disabled={step1Pending}
            className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/25 dark:shadow-[0_0_25px_-4px_rgba(99,102,241,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-violet-300/30"
          >
            {step1Pending ? "Sending Verification Code..." : "Continue to Verification"}
          </button>
        </form>
      ) : (
        /* STEP 2: 6-Digit PIN Verification Form */
        <form action={step2Action} className="space-y-4 relative z-10">
          <input type="hidden" name="challengeId" value={challengeId} />
          <input type="hidden" name="redirectTo" value={callbackUrl} />

          <div className="p-3 bg-slate-100/80 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] rounded-xl text-center space-y-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Sent code to:</span>
            <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-300 block">{maskedEmail}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Code valid for 10 minutes</span>
          </div>

          <div>
            <label htmlFor="pin-input" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 text-center">
              6-Digit Security PIN
            </label>
            <input
              id="pin-input"
              name="pin"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-[#050816] border border-violet-400/50 dark:border-violet-500/50 focus:border-cyan-500 dark:focus:border-cyan-400 rounded-xl text-slate-900 dark:text-white text-center text-2xl tracking-[0.4em] placeholder:tracking-normal placeholder:text-slate-400 dark:placeholder:text-slate-700 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-cyan-400/40 transition shadow-inner"
            />
          </div>

          <button
            id="verify-pin-btn"
            type="submit"
            disabled={step2Pending || pin.length !== 6}
            className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/25 dark:shadow-[0_0_25px_-4px_rgba(99,102,241,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-violet-300/30"
          >
            {step2Pending ? "Verifying PIN & Launching..." : "Verify & Launch BizPilot"}
          </button>

          {/* Resend & Back Controls */}
          <div className="pt-2 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleBackToCredentials}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer flex items-center gap-1 text-[11px]"
            >
              ← Change email
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || isResending}
              className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 disabled:text-slate-400 dark:disabled:text-slate-600 transition cursor-pointer disabled:cursor-not-allowed font-semibold text-[11px]"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : isResending ? "Sending..." : "Resend code"}
            </button>
          </div>
        </form>
      )}

      {/* Quick Demo Credentials Switcher (Only in non-production on Step 1) */}
      {process.env.NODE_ENV !== "production" && !challengeId && (
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
