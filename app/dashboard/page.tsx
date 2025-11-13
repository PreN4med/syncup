import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header with logout button */}
      <header className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Schedule Matcher</h1>
          <LogoutButton />
        </div>
      </header>

      {/* Main Page */}
      <div className="max-w-6xl mx-auto p-8">
        <h2 className="text-4xl font-bold text-gray-800 mb-2">
          Welcome, {user.user_metadata.name || user.email}!
        </h2>
        <p className="text-gray-600 mb-8">
          This is your dashboard. We&apos;ll build the calendar here next!
        </p>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-2xl font-semibold mb-4">Your Groups</h3>
          <p className="text-gray-500">
            No groups yet. Create one to get started!
          </p>
        </div>
      </div>
    </div>
  );
}
