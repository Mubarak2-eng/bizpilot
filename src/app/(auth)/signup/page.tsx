import SignupForm from "@/components/signup-form";

export const metadata = {
  title: "Create Account | BizPilot AI",
  description: "Register your business on BizPilot AI",
};

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <SignupForm />
    </div>
  );
}
