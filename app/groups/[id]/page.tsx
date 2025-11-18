import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

/**
 * Group Detail Page
 * Shows invite code and will contain the schedule calendar
 */
export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch group details
  const { data: group } = await supabase
    .from("groups")
    .select("*")
    .eq("id", id)
    .single();

  if (!group) {
    redirect("/dashboard");
  }

  // Get group members
  const { data: members } = await supabase
    .from("group_members")
    .select(
      `
      user_id,
      joined_at
    `
    )
    .eq("group_id", id);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-8 py-4 flex justify-between items-center">
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-6xl mx-auto p-8">
        {/* Group header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            {group.name}
          </h1>
          {group.description && (
            <p className="text-gray-600 mb-4">{group.description}</p>
          )}

          {/* Invite code section */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-gray-700 mb-2">
              <strong>Invite Code:</strong> Share this code with others to
              invite them to the group
            </p>
            <p className="text-2xl font-mono font-bold text-blue-600">
              {group.invite_code}
            </p>
          </div>
        </div>

        {/* Members section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">
            Members ({members?.length || 0})
          </h2>
          <div className="space-y-2">
            {members && members.length > 0 ? (
              members.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <span className="text-gray-700">
                    Member {member.user_id === user.id ? "(You)" : ""}
                  </span>
                  <span className="text-sm text-gray-500">
                    Joined {new Date(member.joined_at).toLocaleDateString()}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No members yet</p>
            )}
          </div>
        </div>

        {/* Calendar section, placeholder for now */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4">Schedule Calendar</h2>
          <p className="text-gray-500">
            Calendar view soon. This is where you&apos;ll add the availability.
          </p>
        </div>
      </div>
    </div>
  );
}
