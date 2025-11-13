import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
      <div className="text-center text-white max-w-3xl">
        <h1 className="text-6xl font-bold mb-6">Schedule Matcher</h1>
        <p className="text-xl mb-8 text-blue-100">
          Find the perfect time to meet. Compare schedules with your group and
          discover when everyone&apos;s available.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/signup"
            className="bg-white text-purple-600 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-blue-50 transition shadow-lg"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="bg-purple-700 text-white px-8 py-3 rounded-lg font-semibold text-lg hover:bg-purple-800 transition shadow-lg"
          >
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}
