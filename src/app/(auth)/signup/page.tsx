import SignupForm from "@/components/signup-form";

export const metadata = {
  title: "Create Account | BizPilot AI",
  description: "Register your business on BizPilot AI",
};

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-mesh-dark flex items-center justify-center p-4">
      <SignupForm />
    </div>
  );
}
