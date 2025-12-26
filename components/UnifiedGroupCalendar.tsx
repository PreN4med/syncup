"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type AvailabilityBlock = {
  id: string;
  day: string;
  startHour: number;
  endHour: number;
  status: "available" | "busy";
  userId: string;
};

type Member = {
  user_id: string;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
};

type UnifiedGroupCalendarProps = {
  groupId: string;
  currentUserId: string;
  members: Member[];
};

/**
 * UnifiedGroupCalendar - Single calendar showing personal schedule and group overlaps
 * Toggle members to show/hide their availability
 */
export default function UnifiedGroupCalendar({
  groupId,
  currentUserId,
  members,
}: UnifiedGroupCalendarProps) {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const hours = Array.from({ length: 14 }, (_, i) => i + 8);

  const supabase = createClient();

  // State
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [allMemberBlocks, setAllMemberBlocks] = useState<AvailabilityBlock[]>(
    []
  );
  const [nextId, setNextId] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [blockType, setBlockType] = useState<"available" | "busy">("available");

  // Toggle state - which members to show
  const [visibleMembers, setVisibleMembers] = useState<Set<string>>(
    new Set([currentUserId])
  );

  // Overlap filter states
  const [showOnlyOverlapFree, setShowOnlyOverlapFree] = useState(false);
  const [showOnlyOverlapBusy, setShowOnlyOverlapBusy] = useState(false);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartCell, setDragStartCell] = useState<{
    day: string;
    hour: number;
  } | null>(null);
  const [dragCurrentCell, setDragCurrentCell] = useState<{
    day: string;
    hour: number;
  } | null>(null);
  const [dragMode, setDragMode] = useState<"add" | "remove">("add");

  const indexToDay = (index: number) => days[index];
  const dayToIndex = (day: string) => days.indexOf(day);

  /**
   * Load availability for all group members
   */
  useEffect(() => {
    const loadAllAvailability = async () => {
      const { data, error } = await supabase
        .from("availability")
        .select("*")
        .eq("group_id", groupId);

      if (error) {
        console.error("Error loading availability:", error);
        return;
      }

      if (data && data.length > 0) {
        const loadedBlocks: AvailabilityBlock[] = data.map((record, index) => {
          const startHour = parseInt(record.start_time.split(":")[0]);
          const endHour = parseInt(record.end_time.split(":")[0]);

          return {
            id: `loaded-${record.id}-${index}`,
            day: indexToDay(record.day_of_week),
            startHour,
            endHour,
            status: record.status as "available" | "busy",
            userId: record.user_id,
          };
        });

        // Separate current user's blocks from others
        const myBlocks = loadedBlocks.filter((b) => b.userId === currentUserId);
        const otherBlocks = loadedBlocks.filter(
          (b) => b.userId !== currentUserId
        );

        setBlocks(myBlocks);
        setAllMemberBlocks(otherBlocks);
        setNextId(myBlocks.length);
      }
    };

    loadAllAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, currentUserId]);

  /**
   * Toggle member visibility
   */
  const toggleMember = (userId: string) => {
    const newVisible = new Set(visibleMembers);
    if (newVisible.has(userId)) {
      newVisible.delete(userId);
    } else {
      newVisible.add(userId);
    }
    setVisibleMembers(newVisible);
  };

  /**
   * Get color for a specific user
   */
  const getUserColor = (userId: string, status: "available" | "busy") => {
    if (userId === currentUserId) {
      return status === "available"
        ? "bg-green-200 border-green-400"
        : "bg-red-200 border-red-400";
    }

    // Different colors for other members
    const memberIndex = members.findIndex((m) => m.user_id === userId);
    const colors = [
      {
        available: "bg-blue-200 border-blue-400",
        busy: "bg-blue-300 border-blue-500",
      },
      {
        available: "bg-purple-200 border-purple-400",
        busy: "bg-purple-300 border-purple-500",
      },
      {
        available: "bg-yellow-200 border-yellow-400",
        busy: "bg-yellow-300 border-yellow-500",
      },
      {
        available: "bg-pink-200 border-pink-400",
        busy: "bg-pink-300 border-pink-500",
      },
      {
        available: "bg-indigo-200 border-indigo-400",
        busy: "bg-indigo-300 border-indigo-500",
      },
    ];

    const colorScheme = colors[memberIndex % colors.length];
    return status === "available" ? colorScheme.available : colorScheme.busy;
  };

  /**
   * Get all visible blocks (current user + toggled members)
   */
  const getVisibleBlocks = () => {
    const myVisibleBlocks = visibleMembers.has(currentUserId) ? blocks : [];
    const otherVisibleBlocks = allMemberBlocks.filter((b) =>
      visibleMembers.has(b.userId)
    );
    return [...myVisibleBlocks, ...otherVisibleBlocks];
  };

  /**
   * Count overlapping members at a time slot
   */
  const countOverlappingMembers = (day: string, hour: number) => {
    const visibleBlocks = getVisibleBlocks();
    const availableMembers = new Set<string>();

    visibleBlocks.forEach((block) => {
      if (
        block.day === day &&
        block.status === "available" &&
        hour >= block.startHour &&
        hour < block.endHour
      ) {
        availableMembers.add(block.userId);
      }
    });

    return availableMembers.size;
  };

  /**
   * Check if a time slot should be visible based on overlap filters
   * Returns true only if the specific hour meets the overlap criteria
   */
  const shouldShowTimeSlot = (day: string, hour: number) => {
    if (!showOnlyOverlapFree && !showOnlyOverlapBusy) return true;

    const visibleBlocks = getVisibleBlocks();

    if (showOnlyOverlapFree) {
      // Count how many members are available at THIS specific hour
      const availableAtThisHour = visibleBlocks.filter(
        (block) =>
          block.day === day &&
          block.status === "available" &&
          hour >= block.startHour &&
          hour < block.endHour
      );
      return availableAtThisHour.length >= 2;
    }

    if (showOnlyOverlapBusy) {
      // Count how many members are busy at THIS specific hour
      const busyAtThisHour = visibleBlocks.filter(
        (block) =>
          block.day === day &&
          block.status === "busy" &&
          hour >= block.startHour &&
          hour < block.endHour
      );
      return busyAtThisHour.length >= 2;
    }

    return false;
  };

  /**
   * Save current user's schedule
   */
  const handleSave = async () => {
    setSaving(true);
    setSaveMessage("");

    try {
      const { error: deleteError } = await supabase
        .from("availability")
        .delete()
        .eq("user_id", currentUserId)
        .eq("group_id", groupId);

      if (deleteError) throw deleteError;

      const availabilityRecords = blocks.map((block) => ({
        user_id: currentUserId,
        group_id: groupId,
        day_of_week: dayToIndex(block.day),
        start_time: `${block.startHour.toString().padStart(2, "0")}:00:00`,
        end_time: `${block.endHour.toString().padStart(2, "0")}:00:00`,
        status: block.status,
      }));

      if (availabilityRecords.length > 0) {
        const { error: insertError } = await supabase
          .from("availability")
          .insert(availabilityRecords);

        if (insertError) throw insertError;
      }

      setSaveMessage("Schedule saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      console.error("Error saving availability:", error);
      setSaveMessage("Error saving schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  const hasMyBlock = (day: string, hour: number) => {
    return blocks.some(
      (block) =>
        block.day === day && hour >= block.startHour && hour < block.endHour
    );
  };

  const isInDragSelection = (day: string, hour: number) => {
    if (!isDragging || !dragStartCell || !dragCurrentCell) return false;
    if (day !== dragStartCell.day) return false;
    const minHour = Math.min(dragStartCell.hour, dragCurrentCell.hour);
    const maxHour = Math.max(dragStartCell.hour, dragCurrentCell.hour);
    return hour >= minHour && hour <= maxHour;
  };

  const handleMouseDown = (day: string, hour: number) => {
    // Only allow editing your own schedule
    if (!visibleMembers.has(currentUserId)) return;

    setIsDragging(true);
    setDragStartCell({ day, hour });
    setDragCurrentCell({ day, hour });
    setDragMode(hasMyBlock(day, hour) ? "remove" : "add");
  };

  const handleMouseEnter = (day: string, hour: number) => {
    if (isDragging && dragStartCell && day === dragStartCell.day) {
      setDragCurrentCell({ day, hour });
    }
  };

  const handleMouseUp = () => {
    if (isDragging && dragStartCell && dragCurrentCell) {
      const minHour = Math.min(dragStartCell.hour, dragCurrentCell.hour);
      const maxHour = Math.max(dragStartCell.hour, dragCurrentCell.hour);

      if (dragMode === "add") {
        const filteredBlocks = blocks.filter(
          (block) =>
            !(
              block.day === dragStartCell.day &&
              block.startHour >= minHour &&
              block.endHour <= maxHour + 1
            )
        );

        const newBlock: AvailabilityBlock = {
          id: `${dragStartCell.day}-${minHour}-${nextId}`,
          day: dragStartCell.day,
          startHour: minHour,
          endHour: maxHour + 1,
          status: blockType,
          userId: currentUserId,
        };

        setBlocks([...filteredBlocks, newBlock]);
        setNextId(nextId + 1);
      } else {
        setBlocks(
          blocks.filter(
            (block) =>
              !(
                block.day === dragStartCell.day &&
                block.startHour >= minHour &&
                block.endHour <= maxHour + 1
              )
          )
        );
      }
    }

    setIsDragging(false);
    setDragStartCell(null);
    setDragCurrentCell(null);
  };

  const getMemberName = (userId: string) => {
    if (userId === currentUserId) return "You";
    const member = members.find((m) => m.user_id === userId);
    return member?.profiles?.name || member?.profiles?.email || "Unknown";
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Controls */}
      <div className="p-4 bg-blue-50 border-b border-blue-200">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-4">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> Click and drag to edit your schedule
            </p>

            {visibleMembers.has(currentUserId) && (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-blue-200">
                <span className="text-sm text-gray-700">Creating:</span>
                <button
                  onClick={() =>
                    setBlockType(
                      blockType === "available" ? "busy" : "available"
                    )
                  }
                  className={`px-3 py-1 rounded text-sm font-medium transition ${
                    blockType === "available"
                      ? "bg-green-500 text-white"
                      : "bg-red-500 text-white"
                  }`}
                >
                  {blockType === "available" ? "Free" : "Busy"}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Schedule"}
          </button>
        </div>

        {/* Member toggles */}
        <div className="mb-3">
          <span className="text-sm font-medium text-gray-700 mr-2">
            Show schedules:
          </span>
          <div className="flex flex-wrap gap-2 mt-2">
            {members.map((member) => (
              <button
                key={member.user_id}
                onClick={() => toggleMember(member.user_id)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                  visibleMembers.has(member.user_id)
                    ? member.user_id === currentUserId
                      ? "bg-green-500 text-white"
                      : "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {getMemberName(member.user_id)}
                {visibleMembers.has(member.user_id)}
              </button>
            ))}
          </div>
        </div>

        {/* Overlap filter toggles */}
        {visibleMembers.size > 1 && (
          <div className="border-t border-blue-200 pt-3">
            <span className="text-sm font-medium text-gray-700 mr-2">
              Filter by overlaps:
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => {
                  setShowOnlyOverlapFree(!showOnlyOverlapFree);
                  if (!showOnlyOverlapFree) setShowOnlyOverlapBusy(false);
                }}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                  showOnlyOverlapFree
                    ? "bg-green-600 text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {showOnlyOverlapFree}Show Only Overlapping Free Times
              </button>

              <button
                onClick={() => {
                  setShowOnlyOverlapBusy(!showOnlyOverlapBusy);
                  if (!showOnlyOverlapBusy) setShowOnlyOverlapFree(false);
                }}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                  showOnlyOverlapBusy
                    ? "bg-red-600 text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {showOnlyOverlapBusy}Show Only Overlapping Busy Times
              </button>

              {(showOnlyOverlapFree || showOnlyOverlapBusy) && (
                <button
                  onClick={() => {
                    setShowOnlyOverlapFree(false);
                    setShowOnlyOverlapBusy(false);
                  }}
                  className="px-3 py-1 rounded-lg text-sm font-medium bg-gray-300 text-gray-700 hover:bg-gray-400 transition"
                >
                  Clear Filter
                </button>
              )}
            </div>
          </div>
        )}

        {/* Overlap indicator */}
        {visibleMembers.size > 1 &&
          !showOnlyOverlapFree &&
          !showOnlyOverlapBusy && (
            <div className="mt-3 p-2 bg-purple-100 rounded-lg">
              <p className="text-sm text-purple-800">
                <strong>Showing overlaps:</strong> Darker areas = more people
                available
              </p>
            </div>
          )}

        {showOnlyOverlapFree && (
          <div className="mt-3 p-2 bg-green-100 rounded-lg">
            <p className="text-sm text-green-800">
              <strong>Filtering:</strong> Only showing times when 2+ members are
              free
            </p>
          </div>
        )}

        {showOnlyOverlapBusy && (
          <div className="mt-3 p-2 bg-red-100 rounded-lg">
            <p className="text-sm text-red-800">
              <strong>Filtering:</strong> Only showing times when 2+ members are
              busy
            </p>
          </div>
        )}
      </div>

      {saveMessage && (
        <div
          className={`p-3 ${
            saveMessage.includes("Error")
              ? "bg-red-50 text-red-600"
              : "bg-green-50 text-green-600"
          }`}
        >
          {saveMessage}
        </div>
      )}

      {/* Calendar */}
      <div
        className="overflow-x-auto"
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="min-w-[800px] select-none">
          <div className="grid grid-cols-8 border-b border-gray-200">
            <div className="bg-gray-50 p-2 border-r border-gray-200"></div>
            {days.map((day) => (
              <div
                key={day}
                className="bg-gray-50 p-2 text-center font-semibold text-gray-700 border-r border-gray-200 last:border-r-0"
              >
                {day.slice(0, 3)}
              </div>
            ))}
          </div>

          <div className="relative">
            {hours.map((hour) => (
              <div
                key={hour}
                className="grid grid-cols-8 border-b border-gray-200 last:border-b-0"
              >
                <div className="bg-gray-50 p-2 text-sm text-gray-600 border-r border-gray-200 flex items-center h-16 -mt-7.5">
                  {formatHour(hour)}
                </div>

                {days.map((day) => {
                  const inDragSelection = isInDragSelection(day, hour);
                  const overlapCount = countOverlappingMembers(day, hour);
                  const visibleCount = visibleMembers.size;
                  const shouldShow = shouldShowTimeSlot(day, hour);

                  // Background color for overlap indication
                  let bgColor = "";
                  if (visibleCount > 1 && overlapCount > 0) {
                    const intensity = overlapCount / visibleCount;
                    if (overlapCount === visibleCount) bgColor = "bg-green-100";
                    else if (intensity >= 0.5) bgColor = "bg-yellow-50";
                    else bgColor = "bg-orange-50";
                  }

                  // Dim cells that don't match filter
                  if (
                    !shouldShow &&
                    (showOnlyOverlapFree || showOnlyOverlapBusy)
                  ) {
                    bgColor = "bg-gray-100 opacity-30";
                  }

                  return (
                    <div
                      key={`${day}-${hour}`}
                      onMouseDown={() => handleMouseDown(day, hour)}
                      onMouseEnter={() => handleMouseEnter(day, hour)}
                      className={`relative h-16 border-r border-gray-200 last:border-r-0 cursor-pointer transition ${
                        inDragSelection
                          ? "bg-blue-100"
                          : bgColor || "hover:bg-blue-50"
                      }`}
                    >
                      {/* Only show blocks if cell passes filter */}
                      {getVisibleBlocks()
                        .filter((block) => {
                          // Check if this block exists at this hour
                          if (
                            !(
                              block.day === day &&
                              block.startHour <= hour &&
                              block.endHour > hour
                            )
                          ) {
                            return false;
                          }

                          // If no filter is active, show all blocks
                          if (!showOnlyOverlapFree && !showOnlyOverlapBusy) {
                            return true;
                          }

                          // Only show if this specific hour passes the filter
                          return shouldShow;
                        })
                        .map((block, index) => {
                          // Only render the block starting at this hour
                          if (block.startHour !== hour) return null;

                          // Calculate visible height based on filter
                          let visibleStartHour = block.startHour;
                          let visibleEndHour = block.endHour;

                          // When filtering, find the actual overlapping range
                          if (showOnlyOverlapFree || showOnlyOverlapBusy) {
                            // Find first hour where overlap exists
                            for (
                              let h = block.startHour;
                              h < block.endHour;
                              h++
                            ) {
                              if (shouldShowTimeSlot(day, h)) {
                                visibleStartHour = h;
                                break;
                              }
                            }

                            // Find last hour where overlap exists
                            for (
                              let h = block.endHour - 1;
                              h >= block.startHour;
                              h--
                            ) {
                              if (shouldShowTimeSlot(day, h)) {
                                visibleEndHour = h + 1;
                                break;
                              }
                            }

                            // Don't render if no overlap found
                            if (visibleStartHour >= visibleEndHour) return null;
                          }

                          const blockHeight =
                            (visibleEndHour - visibleStartHour) * 64;
                          const offsetTop = (visibleStartHour - hour) * 64;
                          const isMyBlock = block.userId === currentUserId;

                          return (
                            <div
                              key={`${block.id}-${index}`}
                              onClick={(e) => {
                                if (
                                  isMyBlock &&
                                  !showOnlyOverlapFree &&
                                  !showOnlyOverlapBusy
                                ) {
                                  e.stopPropagation();
                                  setBlocks(
                                    blocks.filter((b) => b.id !== block.id)
                                  );
                                }
                              }}
                              className={`absolute left-0 right-0 ${getUserColor(
                                block.userId,
                                block.status
                              )} border-2 flex items-center justify-center z-10 ${
                                isMyBlock &&
                                !showOnlyOverlapFree &&
                                !showOnlyOverlapBusy
                                  ? "cursor-pointer hover:opacity-80"
                                  : "cursor-default opacity-70"
                              } transition`}
                              style={{
                                height: `${blockHeight}px`,
                                top: `${offsetTop}px`,
                              }}
                              title={`${getMemberName(block.userId)} - ${
                                block.status === "available" ? "Free" : "Busy"
                              }`}
                            >
                              <span className="text-xs font-medium text-gray-700 pointer-events-none">
                                {visibleCount === 1
                                  ? block.status === "available"
                                    ? "Free"
                                    : "Busy"
                                  : showOnlyOverlapFree || showOnlyOverlapBusy
                                  ? block.status === "available"
                                    ? "Overlap Free"
                                    : "Overlap Busy"
                                  : getMemberName(block.userId).split(" ")[0]}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
