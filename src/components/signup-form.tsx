"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerAction } from "@/lib/actions/auth";

export default function SignupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const res = await registerAction(null, formData);

    if (res?.error) {
      setError(res.error);
      setLoading(false);
    } else {
      router.push("/login?registered=true");
    }
  };

  return (
    <div className="w-full max-w-md p-7 sm:p-9 bg-[#090e24]/85 border border-violet-500/30 rounded-3xl shadow-[0_0_50px_-10px_rgba(139,92,246,0.3)] backdrop-blur-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="text-center mb-7 relative z-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 p-[1.5px] shadow-[0_0_25px_rgba(99,102,241,0.4)] mb-3.5">
          <div className="w-full h-full bg-[#080c1d] rounded-[14px] flex items-center justify-center font-black text-white text-xl tracking-tight">
            BP
          </div>
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Create Business Account</h1>
        <p className="text-xs text-slate-400 mt-1">Get started with BizPilot AI Business OS</p>
      </div>

      {error && (
        <div className="mb-5 p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs font-medium relative z-10">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5 relative z-10">
        <div>
          <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
            Full Name
          </label>
          <input
            id="name-input"
            name="name"
            type="text"
            required
            placeholder="John Doe"
            className="w-full px-4 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500 transition"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
            Email Address
          </label>
          <input
            id="email-input"
            name="email"
            type="email"
            required
            placeholder="john@example.com"
            className="w-full px-4 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500 transition font-mono"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
            Password (min. 8 characters)
          </label>
          <input
            id="password-input"
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="••••••••••••"
            className="w-full px-4 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500 transition"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
            Business / Organization Name
          </label>
          <input
            id="businessName-input"
            name="businessName"
            type="text"
            required
            placeholder="Acme Global Ventures"
            className="w-full px-4 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500 transition"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
            Operating Currency
          </label>
          <select
            id="currency-select"
            name="currency"
            defaultValue="NGN"
            className="w-full px-4 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-white text-xs focus:outline-none transition cursor-pointer"
          >
            <option value="NGN">NGN (Nigerian Naira - ₦)</option>
            <option value="USD">USD (US Dollar - $)</option>
            <option value="GBP">GBP (British Pound - £)</option>
            <option value="EUR">EUR (Euro - €)</option>
            <option value="GHS">GHS (Ghanaian Cedi - GH₵)</option>
            <option value="KES">KES (Kenyan Shilling - KSh)</option>
          </select>
        </div>

        <button
          id="submit-signup-btn"
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-xs rounded-xl shadow-[0_0_25px_-4px_rgba(99,102,241,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-violet-300/30 mt-2"
        >
          {loading ? "Initializing Workspace..." : "Register & Start Business OS"}
        </button>
      </form>

      <div className="mt-6 text-center text-xs text-slate-400 relative z-10">
        Already have an account?{" "}
        <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-semibold underline">
          Sign in here
        </Link>
      </div>
    </div>
  );
}
