import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import WeeklyCalendar from "@/components/WeeklyCalendar";

// Define member type with profile
type GroupMember = {
  user_id: string;
  joined_at: string;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
};

/**
 * Group Detail Page - Displays group information and members
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

  // Fetch group members with profile details
  const { data: membersData } = await supabase
    .from("group_members")
    .select(
      `
      user_id,
      joined_at,
      profiles (
        name,
        email
      )
    `
    )
    .eq("group_id", id);

  // Transform the data to handle the nested structure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members: GroupMember[] = (membersData || []).map((item: any) => ({
    user_id: item.user_id,
    joined_at: item.joined_at,
    profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
  }));

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
                  <span className="text-gray-700 font-medium">
                    {member.profiles?.name ||
                      member.profiles?.email ||
                      "Unknown User"}
                    {member.user_id === user.id && (
                      <span className="text-sm text-blue-600 ml-2">(You)</span>
                    )}
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

        {/* Calendar section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4">Your Schedule</h2>
          <p className="text-gray-600 mb-4">
            Click and drag on the calendar to mark when you&apos;re available.
          </p>
          <WeeklyCalendar groupId={id} userId={user.id} />
        </div>
      </div>
    </div>
  );
}
