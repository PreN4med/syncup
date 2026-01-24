import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";

// Define the Group type
type Group = {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_at: string;
};

/**
 * Dashboard Page, the landing page after authentication
 * Displays user's groups and provides access to schedule management
 */
export default async function DashboardPage() {
  // Initialize Supabase client for server-side data fetching
  const supabase = await createClient();

  // Get current authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect to login if user is not authenticated
  if (!user) {
    redirect("/login");
  }

  // Fetch user's groups from database
  const { data: groupMemberships } = await supabase
    .from("group_members")
    .select(
      `
      groups (
        id,
        name,
        description,
        invite_code,
        created_at
      )
    `,
    )
    .eq("user_id", user.id);

  // Extract groups from the membership data
  const groups: Group[] =
    groupMemberships
      // this is needed because using any type, which typescript doesn't like
      // doing it manually to match each type would be a pain but probably better

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ?.map((membership: any) => membership.groups)
      .filter(Boolean) || [];

  return (
    <div className="min-h-screen bg-linear-to-b from-orange-300 to-yellow-300 text-gray-900">
      {/* Header with logout button */}
      <header className="bg-amber-400 shadow">
        <div className="max-w-6xl mx-auto px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Schedule Matcher</h1>
          <LogoutButton />
        </div>
      </header>

      {/* Main content area */}
      <div className="max-w-6xl mx-auto p-8">
        {/* Welcome message - displays user's name or email as fallback */}
        <h2 className="text-4xl font-bold text-gray-800 mb-2">
          Welcome, {user.user_metadata.name || user.email}!
        </h2>
        <p className="text-gray-600 mb-8">
          Create or join groups to start coordinating schedules with others.
        </p>

        {/* Groups section - will display user's schedule groups */}
        <div className="bg-lime-200 rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6 ">
            <h3 className="text-2xl font-semibold">Your Groups</h3>
            <div className="flex gap-3">
              <Link
                href="/groups/join"
                className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition"
              >
                Join Group
              </Link>
              <Link
                href="/groups/create"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
              >
                + Create Group
              </Link>
            </div>
          </div>

          {/* Display groups or empty state */}
          {groups && groups.length > 0 ? (
            <div className="grid gap-4">
              {groups.map((group) => (
                <Link
                  key={group.id}
                  href={`/groups/${group.id}`}
                  className="border border-blue-400 rounded-lg p-4 hover:border-blue-500 hover:shadow-md transition bg-gray-100"
                >
                  <h4 className="text-xl font-semibold text-gray-800 mb-1">
                    {group.name}
                  </h4>
                  {group.description && (
                    <p className="text-gray-600 mb-2">{group.description}</p>
                  )}
                  <p className="text-sm text-gray-500">
                    Invite Code:{" "}
                    <span className="font-mono font-semibold">
                      {group.invite_code}
                    </span>
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              No groups yet. Create one to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
