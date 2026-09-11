import SignupForm from "@/components/signup-form";

export const metadata = {
  title: "Create Account | BizPilot AI",
  description: "Register your business on BizPilot AI",
};

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-mesh-dark flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md mx-auto py-6">
        <SignupForm />
      </div>
    </div>
  );
}
