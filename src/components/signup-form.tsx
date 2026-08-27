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
    <div className="w-full max-w-md p-8 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 font-bold text-xl mb-3 border border-indigo-500/30">
          BP
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Create Business Account</h1>
        <p className="text-sm text-slate-400 mt-1">Get started with BizPilot AI multi-tenant SaaS</p>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
            Full Name
          </label>
          <input
            id="name-input"
            name="name"
            type="text"
            required
            placeholder="John Doe"
            className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
            Email Address
          </label>
          <input
            id="email-input"
            name="email"
            type="email"
            required
            placeholder="john@example.com"
            className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
            Password (min. 8 characters)
          </label>
          <input
            id="password-input"
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="••••••••••••"
            className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
            Business / Organization Name
          </label>
          <input
            id="businessName-input"
            name="businessName"
            type="text"
            required
            placeholder="Acme Global Ventures"
            className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
            Currency
          </label>
          <select
            id="currency-select"
            name="currency"
            defaultValue="NGN"
            className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
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
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-lg shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? "Creating business account..." : "Register & Start Business"}
        </button>
      </form>

      <div className="mt-6 text-center text-xs text-slate-400">
        Already have an account?{" "}
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium underline">
          Sign in here
        </Link>
      </div>
    </div>
  );
}
