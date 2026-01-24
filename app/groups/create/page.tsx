"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Create Group Page
 * Generates a unique invite code to share with
 */
export default function CreateGroupPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  /**
   * Generates a random 6-character invite code
   * Uses uppercase letters and numbers
   */
  const generateInviteCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  /**
   * Handles group creation form submission
   * Creates group, generates invite code, and adds creator as member
   */
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in to create a group");
      setLoading(false);
      return;
    }

    // Generate unique invite code
    const inviteCode = generateInviteCode();

    // Create the group
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .insert({
        name,
        description,
        invite_code: inviteCode,
        created_by: user.id,
      })
      .select()
      .single();

    if (groupError) {
      setError(groupError.message);
      setLoading(false);
      return;
    }

    // Add creator as first group member
    const { error: memberError } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: user.id,
    });

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    // Redirect to group page on success
    router.push(`/groups/${group.id}`);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-300 to-sky-100 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="text-blue-600 hover:underline mb-4 inline-block"
        >
          ← Back to Dashboard
        </Link>

        {/* Create group form */}
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">
            Create a New Group
          </h1>

          <form onSubmit={handleCreateGroup} className="space-y-4">
            {/* Group name input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Group Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="e.g., Study Group, Team Meeting"
                required
              />
            </div>

            {/* Group description input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="What's this group for?"
                rows={3}
              />
            </div>

            {/* Error message display */}
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating..." : "Create Group"}
            </button>
          </form>

          {/* Info about invite codes */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              After creating the group, you&apos;ll receive a unique invite code
              to share with others.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
