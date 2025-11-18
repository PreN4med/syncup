"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Join Group Page, Allows users to join existing groups using invite codes
 * Validates invite code and adds user as group member
 */
export default function JoinGroupPage() {
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  /**
   * Handles join group form submission
   * Finds group by invite code and adds current user as member
   */
  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in to join a group");
      setLoading(false);
      return;
    }

    // Normalize invite code so they have same format
    const normalizedCode = inviteCode.trim().toUpperCase();

    // Find group by invite code
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, name")
      .eq("invite_code", normalizedCode)
      .single();

    if (groupError || !group) {
      setError("Invalid invite code. Please check and try again.");
      setLoading(false);
      return;
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", group.id)
      .eq("user_id", user.id)
      .single();

    if (existingMember) {
      setError("You are already a member of this group.");
      setLoading(false);
      return;
    }

    // Add user to group
    const { error: memberError } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: user.id,
    });

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    // Redirect to group page
    router.push(`/groups/${group.id}`);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="text-blue-600 hover:underline mb-4 inline-block"
        >
          ← Back to Dashboard
        </Link>

        {/* Join group form */}
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">
            Join a Group
          </h1>

          <form onSubmit={handleJoinGroup} className="space-y-4">
            {/* Invite code input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Invite Code
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 font-mono text-lg uppercase"
                placeholder="ABC123"
                required
                maxLength={6}
              />
              <p className="text-sm text-gray-500 mt-1">
                Enter the 6-character code shared by the group creator
              </p>
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
              className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Joining..." : "Join Group"}
            </button>
          </form>

          {/* Info section */}
          <div className="mt-6 p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-green-800">
              <strong>Note:</strong> Ask the group creator for their invite
              code. Once you join, you&apos;ll be able to share your schedule
              with the group.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
