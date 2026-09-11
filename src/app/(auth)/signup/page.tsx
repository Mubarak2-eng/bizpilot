import SignupForm from "@/components/signup-form";
import TutorialVideoPlayer from "@/components/tutorial-video-player";

export const metadata = {
  title: "Create Account | BizPilot AI",
  description: "Register your business on BizPilot AI",
};

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-mesh-dark flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center py-6">
        <TutorialVideoPlayer />
        <div className="flex justify-center w-full">
          <SignupForm />
        </div>
      </div>
    </div>
  );
}
