"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useTransition } from "react";
import {
  initiateLoginAction,
  verifyLoginOTPAction,
  resendLoginOTPAction,
} from "@/lib/actions/auth";

type LoginStep = "CREDENTIALS" | "OTP";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const registered = searchParams.get("registered");
  const authError = searchParams.get("error");

  const [step, setStep] = useState<LoginStep>("CREDENTIALS");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [isPending, startTransition] = useTransition();

  // Handle countdown timer for Resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Compute initial error from NextAuth URL search params
  const initialAuthError = (() => {
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
  })();

  const displayErrorMessage = errorMessage || initialAuthError;


  // Step 1: Submit Credentials & Request OTP
  const handleSubmitCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    startTransition(async () => {
      const result = await initiateLoginAction(email, password);
      if (!result.success) {
        setErrorMessage(result.error || "Invalid credentials.");
        return;
      }

      if (result.step === "OTP_REQUIRED" && result.challengeToken) {
        setChallengeToken(result.challengeToken);
        setMaskedEmail(result.emailMasked || email);
        setStep("OTP");
        setResendCooldown(60); // 60s cooldown timer
      }
    });
  };

  // Step 2: Submit 6-digit OTP code to complete sign-in
  const handleSubmitOTP = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const cleanOtp = otpCode.trim();
    if (cleanOtp.length !== 6) {
      setErrorMessage("Please enter the complete 6-digit verification code.");
      return;
    }

    startTransition(async () => {
      const result = await verifyLoginOTPAction(challengeToken, cleanOtp, callbackUrl);
      if (result && !result.success) {
        setErrorMessage(result.error || "Verification failed. Please check the code.");
      }
    });
  };

  // Resend 6-digit OTP
  const handleResendCode = () => {
    if (resendCooldown > 0 || isPending) return;
    setErrorMessage(null);
    setInfoMessage(null);

    startTransition(async () => {
      const result = await resendLoginOTPAction(challengeToken);
      if (!result.success) {
        setErrorMessage(result.error || "Failed to resend code.");
        return;
      }
      setInfoMessage(result.message || "A new 6-digit verification code has been sent.");
      setResendCooldown(60);
    });
  };

  // Go back to credentials step
  const handleBackToCredentials = () => {
    setStep("CREDENTIALS");
    setOtpCode("");
    setErrorMessage(null);
    setInfoMessage(null);
  };

  return (
    <div className="w-full max-w-md p-7 sm:p-9 bg-white/95 dark:bg-[#090e24]/85 border border-slate-200 dark:border-violet-500/30 rounded-3xl shadow-xl dark:shadow-[0_0_50px_-10px_rgba(139,92,246,0.3)] backdrop-blur-2xl relative overflow-hidden transition-all duration-300">
      <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 dark:bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Branding */}
      <div className="text-center mb-7 relative z-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 p-[1.5px] shadow-md shadow-indigo-600/20 dark:shadow-[0_0_25px_rgba(99,102,241,0.4)] mb-3.5">
          <div className="w-full h-full bg-slate-900 dark:bg-[#080c1d] rounded-[14px] flex items-center justify-center font-black text-white text-xl tracking-tight">
            {step === "OTP" ? "🔐" : "BP"}
          </div>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          {step === "OTP" ? "Enter Verification Code" : "Sign in to BizPilot AI"}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {step === "OTP"
            ? `We sent a 6-digit code to ${maskedEmail}`
            : "Autonomous Business Operating System"}
        </p>
      </div>

      {registered && step === "CREDENTIALS" && (
        <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium relative z-10">
          Account created successfully! Please sign in with your credentials.
        </div>
      )}

      {infoMessage && (
        <div className="mb-5 p-3.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-500/30 text-cyan-800 dark:text-cyan-300 text-xs font-medium relative z-10">
          {infoMessage}
        </div>
      )}

      {displayErrorMessage && (
        <div className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs font-medium relative z-10">
          {displayErrorMessage}
        </div>
      )}

      {/* STEP 1: Email & Password */}
      {step === "CREDENTIALS" && (
        <form onSubmit={handleSubmitCredentials} className="space-y-4 relative z-10">
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
              placeholder="name@company.com"
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
            {isPending ? "Validating Credentials..." : "Continue with Email Code"}
          </button>
        </form>
      )}

      {/* STEP 2: 6-Digit Email OTP Verification */}
      {step === "OTP" && (
        <form onSubmit={handleSubmitOTP} className="space-y-4 relative z-10">
          <div>
            <label htmlFor="otp-input" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 text-center">
              6-Digit Security Code
            </label>
            <input
              id="otp-input"
              name="otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              required
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-[#050816] border-2 border-violet-500/50 dark:border-violet-500/50 focus:border-cyan-400 rounded-xl text-slate-900 dark:text-white text-center font-mono text-2xl font-black tracking-[0.35em] placeholder:text-slate-400 dark:placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 transition shadow-xs"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center mt-2">
              Code expires in 10 minutes.
            </p>
          </div>

          <button
            id="submit-otp-btn"
            type="submit"
            disabled={isPending || otpCode.length !== 6}
            className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/25 dark:shadow-[0_0_25px_-4px_rgba(16,185,129,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-emerald-300/30"
          >
            {isPending ? "Verifying..." : "Verify & Sign In"}
          </button>

          {/* Resend & Back Controls */}
          <div className="flex items-center justify-between pt-3 text-xs">
            <button
              type="button"
              onClick={handleBackToCredentials}
              className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-medium cursor-pointer transition"
            >
              ← Use different email
            </button>

            <button
              type="button"
              onClick={handleResendCode}
              disabled={resendCooldown > 0 || isPending}
              className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
            >
              {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
            </button>
          </div>
        </form>
      )}

      {step === "CREDENTIALS" && (
        <div className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400 relative z-10">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-semibold underline">
            Create business account
          </Link>
        </div>
      )}
    </div>
  );
}

