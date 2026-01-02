"use client";

import { useState, useEffect, useRef } from "react";
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
  const calendarRef = useRef<HTMLDivElement>(null);

  // State
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [allMemberBlocks, setAllMemberBlocks] = useState<AvailabilityBlock[]>(
    []
  );
  const [nextId, setNextId] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [blockType, setBlockType] = useState<"available" | "busy">("available");

  // Time input state
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [timeInput, setTimeInput] = useState({
    day: "",
    startHour: "",
    startMinute: "",
    startPeriod: "AM" as "AM" | "PM",
    endHour: "",
    endMinute: "",
    endPeriod: "AM" as "AM" | "PM",
  });

  // Toggle members
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

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizingBlockId, setResizingBlockId] = useState<string | null>(null);
  const [resizeEdge, setResizeEdge] = useState<"top" | "bottom" | null>(null);
  const [resizeDay, setResizeDay] = useState<string | null>(null);

  const indexToDay = (index: number) => days[index];
  const dayToIndex = (day: string) => days.indexOf(day);

  /**
   * Convert 12-hour time to 24-hour decimal format
   */
  const convertTo24Hour = (
    hour: string,
    minute: string,
    period: "AM" | "PM"
  ): number => {
    let h = parseInt(hour);
    const m = parseInt(minute);

    if (isNaN(h) || isNaN(m)) return 0;

    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;

    return h + m / 60;
  };

  /**
   * Add block from time input
   */
  const handleAddTimeBlock = () => {
    if (
      !timeInput.day ||
      !timeInput.startHour ||
      !timeInput.startMinute ||
      !timeInput.endHour ||
      !timeInput.endMinute
    ) {
      alert("Please fill in all time fields");
      return;
    }

    const startHour = convertTo24Hour(
      timeInput.startHour,
      timeInput.startMinute,
      timeInput.startPeriod
    );
    const endHour = convertTo24Hour(
      timeInput.endHour,
      timeInput.endMinute,
      timeInput.endPeriod
    );

    if (endHour <= startHour) {
      alert("End time must be after start time");
      return;
    }

    if (startHour < 8 || endHour > 22) {
      alert("Time must be between 8:00 AM and 10:00 PM");
      return;
    }

    // 1. Check for conflicts ONLY with DIFFERENT status blocks (e.g., Free vs Busy)
    const hasConflict = blocks.some((block) => {
      if (block.day !== timeInput.day) return false;
      if (block.status === blockType) return false; // Ignore same status for conflict check

      return (
        (startHour >= block.startHour && startHour < block.endHour) ||
        (endHour > block.startHour && endHour <= block.endHour) ||
        (startHour <= block.startHour && endHour >= block.endHour)
      );
    });

    if (hasConflict) {
      alert("This time conflicts with an existing block of different status");
      return;
    }

    // 2. Prepare the new block
    const newBlock: AvailabilityBlock = {
      id: `${timeInput.day}-${startHour}-${nextId}`,
      day: timeInput.day,
      startHour,
      endHour,
      status: blockType,
      userId: currentUserId,
    };

    // 3. Merge EVERYTHING together
    // We don't filter out same-status blocks anymore.
    // mergeOverlappingBlocks will see the 9-11 and 10-11:30 and combine them.
    const mergedBlocks = mergeOverlappingBlocks([...blocks, newBlock]);

    setBlocks(mergedBlocks);
    setNextId(nextId + 1);

    // Reset form
    setTimeInput({
      day: "",
      startHour: "",
      startMinute: "",
      startPeriod: "AM",
      endHour: "",
      endMinute: "",
      endPeriod: "AM",
    });
    setShowTimeInput(false);
  };

  /**
   * Get hour from mouse Y position
   */
  const getHourFromMouseY = (clientY: number) => {
    if (!calendarRef.current) return 8;
    const rect = calendarRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const hourHeight = 64;
    const decimalHour = y / hourHeight;
    return Math.max(8, Math.min(22, 8 + decimalHour));
  };

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
          const startMinute = parseInt(record.start_time.split(":")[1]);
          const endHour = parseInt(record.end_time.split(":")[0]);
          const endMinute = parseInt(record.end_time.split(":")[1]);

          return {
            id: `loaded-${record.id}-${index}`,
            day: indexToDay(record.day_of_week),
            startHour: startHour + startMinute / 60,
            endHour: endHour + endMinute / 60,
            status: record.status as "available" | "busy",
            userId: record.user_id,
          };
        });

        const myBlocks = loadedBlocks.filter((b) => b.userId === currentUserId);
        const otherBlocks = loadedBlocks.filter(
          (b) => b.userId !== currentUserId
        );

        setBlocks(myBlocks);
        setAllMemberBlocks(otherBlocks);
        setNextId(loadedBlocks.length);
      }
    };

    loadAllAvailability();
  }, [groupId, currentUserId]);

  /**
   * Resize blocks
   */
  useEffect(() => {
    if (!isResizing || !resizingBlockId || !resizeEdge || !resizeDay) return;

    const onMouseMove = (e: MouseEvent) => {
      const hour = getHourFromMouseY(e.clientY);

      setBlocks((prev) => {
        return prev.map((b) => {
          if (b.id !== resizingBlockId || b.day !== resizeDay) return b;

          let newStartHour = b.startHour;
          let newEndHour = b.endHour;

          if (resizeEdge === "bottom") {
            newEndHour = Math.max(hour, b.startHour + 0.25);
          } else {
            newStartHour = Math.min(hour, b.endHour - 0.25);
          }

          // Check if resize would conflict with a block of different status
          const hasConflict = prev.some((other) => {
            if (other.id === b.id) return false;
            if (other.day !== b.day) return false;
            if (other.status === b.status) return false;

            return (
              (newStartHour >= other.startHour &&
                newStartHour < other.endHour) ||
              (newEndHour > other.startHour && newEndHour <= other.endHour) ||
              (newStartHour <= other.startHour && newEndHour >= other.endHour)
            );
          });

          if (hasConflict) return b;

          return { ...b, startHour: newStartHour, endHour: newEndHour };
        });
      });
    };

    const onMouseUp = () => {
      setBlocks((prev) => mergeOverlappingBlocks(prev));
      setIsResizing(false);
      setResizingBlockId(null);
      setResizeEdge(null);
      setResizeDay(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, resizingBlockId, resizeEdge, resizeDay]);

  const startResize = (
    e: React.MouseEvent,
    blockId: string,
    edge: "top" | "bottom",
    day: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizingBlockId(blockId);
    setResizeEdge(edge);
    setResizeDay(day);
  };

  const toggleMember = (userId: string) => {
    const newVisible = new Set(visibleMembers);
    if (newVisible.has(userId)) {
      newVisible.delete(userId);
    } else {
      newVisible.add(userId);
    }
    setVisibleMembers(newVisible);
  };

  const getUserColor = (userId: string, status: "available" | "busy") => {
    if (userId === currentUserId) {
      return status === "available"
        ? "bg-green-200 border-green-400"
        : "bg-red-200 border-red-400";
    }

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

  const getVisibleBlocks = () => {
    const myVisibleBlocks = visibleMembers.has(currentUserId) ? blocks : [];
    const otherVisibleBlocks = allMemberBlocks.filter((b) =>
      visibleMembers.has(b.userId)
    );
    return [...myVisibleBlocks, ...otherVisibleBlocks];
  };

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

  const shouldShowTimeSlot = (day: string, hour: number) => {
    if (!showOnlyOverlapFree && !showOnlyOverlapBusy) return true;

    const visibleBlocks = getVisibleBlocks();

    if (showOnlyOverlapFree) {
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

      const availabilityRecords = blocks.map((block) => {
        const startHourInt = Math.floor(block.startHour);
        const startMinute = Math.round((block.startHour - startHourInt) * 60);
        const endHourInt = Math.floor(block.endHour);
        const endMinute = Math.round((block.endHour - endHourInt) * 60);

        return {
          user_id: currentUserId,
          group_id: groupId,
          day_of_week: dayToIndex(block.day),
          start_time: `${startHourInt.toString().padStart(2, "0")}:${startMinute
            .toString()
            .padStart(2, "0")}:00`,
          end_time: `${endHourInt.toString().padStart(2, "0")}:${endMinute
            .toString()
            .padStart(2, "0")}:00`,
          status: block.status,
        };
      });

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
    if (isResizing) return;
    if (!visibleMembers.has(currentUserId) || visibleMembers.size > 1) return;

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
    if (!isDragging || !dragStartCell || !dragCurrentCell) return;

    const minHour = Math.min(dragStartCell.hour, dragCurrentCell.hour);
    const maxHour = Math.max(dragStartCell.hour, dragCurrentCell.hour);

    if (dragMode === "add") {
      const hasConflict = blocks.some((block) => {
        if (block.day !== dragStartCell.day) return false;
        if (block.status === blockType) return false;

        const hasOverlap =
          (block.startHour >= minHour && block.startHour < maxHour + 1) ||
          (block.endHour > minHour && block.endHour <= maxHour + 1) ||
          (block.startHour <= minHour && block.endHour >= maxHour + 1);

        return hasOverlap;
      });

      if (hasConflict) {
        setIsDragging(false);
        setDragStartCell(null);
        setDragCurrentCell(null);
        return;
      }

      const filteredBlocks = blocks.filter((block) => {
        if (block.day !== dragStartCell.day) return true;
        if (block.status !== blockType) return true;

        const hasOverlap =
          (block.startHour >= minHour && block.startHour < maxHour + 1) ||
          (block.endHour > minHour && block.endHour <= maxHour + 1) ||
          (block.startHour <= minHour && block.endHour >= maxHour + 1);

        return !hasOverlap;
      });

      const newBlock: AvailabilityBlock = {
        id: `${dragStartCell.day}-${minHour}-${nextId}`,
        day: dragStartCell.day,
        startHour: minHour,
        endHour: maxHour + 1,
        status: blockType,
        userId: currentUserId,
      };

      const mergedBlocks = mergeOverlappingBlocks([
        ...filteredBlocks,
        newBlock,
      ]);
      setBlocks(mergedBlocks);
      setNextId(nextId + 1);
    } else {
      setBlocks(
        blocks.filter((block) => {
          if (block.day !== dragStartCell.day) return true;

          const hasOverlap =
            (block.startHour >= minHour && block.startHour < maxHour + 1) ||
            (block.endHour > minHour && block.endHour <= maxHour + 1) ||
            (block.startHour <= minHour && block.endHour >= maxHour + 1);

          return !hasOverlap;
        })
      );
    }

    setIsDragging(false);
    setDragStartCell(null);
    setDragCurrentCell(null);
  };

  const mergeOverlappingBlocks = (
    blocks: AvailabilityBlock[]
  ): AvailabilityBlock[] => {
    const merged: AvailabilityBlock[] = [];

    const groupedByDay = blocks.reduce((acc, block) => {
      const key = `${block.day}-${block.status}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(block);
      return acc;
    }, {} as Record<string, AvailabilityBlock[]>);

    Object.values(groupedByDay).forEach((dayBlocks) => {
      const sorted = [...dayBlocks].sort((a, b) => a.startHour - b.startHour);
      let current = sorted[0];

      for (let i = 1; i < sorted.length; i++) {
        const next = sorted[i];
        if (next.startHour <= current.endHour) {
          current = {
            ...current,
            endHour: Math.max(current.endHour, next.endHour),
          };
        } else {
          merged.push(current);
          current = next;
        }
      }
      merged.push(current);
    });

    return merged;
  };

  const getMemberName = (userId: string) => {
    if (userId === currentUserId) return "You";
    const member = members.find((m) => m.user_id === userId);
    return member?.profiles?.name || member?.profiles?.email || "Unknown";
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="p-4 bg-blue-50 border-b border-blue-200">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-4">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong>{" "}
              {visibleMembers.size > 1
                ? "Toggle off other members to edit your schedule"
                : "Click and drag to edit. Hover over edges to resize."}
            </p>

            {visibleMembers.has(currentUserId) && visibleMembers.size === 1 && (
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

          <div className="flex gap-2">
            <button
              onClick={() => setShowTimeInput(!showTimeInput)}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition"
            >
              {showTimeInput ? "Hide" : "Add Exact Time"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Schedule"}
            </button>
          </div>
        </div>

        {showTimeInput &&
          visibleMembers.has(currentUserId) &&
          visibleMembers.size === 1 && (
            <div className="mb-4 p-4 bg-white rounded-lg border-2 border-purple-300">
              <h3 className="font-semibold text-gray-800 mb-3">
                Add Exact Time Block
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-full">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Day
                  </label>
                  <select
                    value={timeInput.day}
                    onChange={(e) =>
                      setTimeInput({ ...timeInput, day: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white"
                  >
                    <option value="">Select a day</option>
                    {days.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Time
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      max="12"
                      placeholder="Hour"
                      value={timeInput.startHour}
                      onChange={(e) =>
                        setTimeInput({
                          ...timeInput,
                          startHour: e.target.value,
                        })
                      }
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white"
                    />
                    <span className="flex items-center">:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      placeholder="Min"
                      value={timeInput.startMinute}
                      onChange={(e) =>
                        setTimeInput({
                          ...timeInput,
                          startMinute: e.target.value,
                        })
                      }
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white"
                    />
                    <select
                      value={timeInput.startPeriod}
                      onChange={(e) =>
                        setTimeInput({
                          ...timeInput,
                          startPeriod: e.target.value as "AM" | "PM",
                        })
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Time
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      max="12"
                      placeholder="Hour"
                      value={timeInput.endHour}
                      onChange={(e) =>
                        setTimeInput({ ...timeInput, endHour: e.target.value })
                      }
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white"
                    />
                    <span className="flex items-center">:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      placeholder="Min"
                      value={timeInput.endMinute}
                      onChange={(e) =>
                        setTimeInput({
                          ...timeInput,
                          endMinute: e.target.value,
                        })
                      }
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white"
                    />
                    <select
                      value={timeInput.endPeriod}
                      onChange={(e) =>
                        setTimeInput({
                          ...timeInput,
                          endPeriod: e.target.value as "AM" | "PM",
                        })
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>

                <div className="col-span-full flex gap-2">
                  <button
                    onClick={handleAddTimeBlock}
                    className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition"
                  >
                    Add {blockType === "available" ? "Free" : "Busy"} Time
                  </button>
                  <button
                    onClick={() => setShowTimeInput(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

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
              </button>
            ))}
          </div>

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
                  Show Only Overlapping Free Times
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
                  Show Only Overlapping Busy Times
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

        <div
          className="overflow-x-auto"
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="min-w-[800px] select-none" ref={calendarRef}>
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
                  <div className="bg-gray-50 p-2 text-sm text-gray-600 border-r border-gray-200 flex items-center h-16">
                    {formatHour(hour)}
                  </div>

                  {days.map((day) => {
                    const inDragSelection = isInDragSelection(day, hour);
                    const overlapCount = countOverlappingMembers(day, hour);
                    const visibleCount = visibleMembers.size;
                    const shouldShow = shouldShowTimeSlot(day, hour);

                    let bgColor = "";
                    if (visibleCount > 1 && overlapCount > 0) {
                      const intensity = overlapCount / visibleCount;
                      if (overlapCount === visibleCount)
                        bgColor = "bg-green-100";
                      else if (intensity >= 0.5) bgColor = "bg-yellow-50";
                      else bgColor = "bg-orange-50";
                    }

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
                        {getVisibleBlocks()
                          .filter((block) => {
                            const blockStartsInThisHour =
                              block.day === day &&
                              Math.floor(block.startHour) === hour;

                            if (!blockStartsInThisHour) return false;
                            if (!showOnlyOverlapFree && !showOnlyOverlapBusy)
                              return true;
                            return shouldShow;
                          })
                          .map((block, index) => {
                            const blockHeight =
                              (block.endHour - block.startHour) * 64;
                            const offsetTop = (block.startHour - hour) * 64;
                            const isMyBlock = block.userId === currentUserId;

                            return (
                              <div
                                key={`${block.id}-${index}`}
                                className={`absolute left-0 right-0 ${getUserColor(
                                  block.userId,
                                  block.status
                                )} border-2 flex flex-col items-center justify-center z-10 ${
                                  isMyBlock &&
                                  !showOnlyOverlapFree &&
                                  !showOnlyOverlapBusy &&
                                  visibleMembers.size === 1
                                    ? "cursor-pointer hover:opacity-80"
                                    : "cursor-default opacity-70"
                                } transition group`}
                                style={{
                                  height: `${blockHeight}px`,
                                  top: `${offsetTop}px`,
                                  pointerEvents: isResizing ? "none" : "auto",
                                }}
                                title={`${getMemberName(block.userId)} - ${
                                  block.status === "available" ? "Free" : "Busy"
                                }`}
                              >
                                {isMyBlock &&
                                  !showOnlyOverlapFree &&
                                  !showOnlyOverlapBusy &&
                                  visibleMembers.size === 1 &&
                                  blockHeight >= 16 && (
                                    <div
                                      className="absolute top-0 left-0 right-0 h-4 cursor-ns-resize hover:bg-black hover:bg-opacity-30 z-20 opacity-0 group-hover:opacity-100 transition"
                                      onMouseDown={(e) =>
                                        startResize(
                                          e,
                                          block.id,
                                          "top",
                                          block.day
                                        )
                                      }
                                    />
                                  )}

                                <div
                                  onClick={(e) => {
                                    if (
                                      isMyBlock &&
                                      !showOnlyOverlapFree &&
                                      !showOnlyOverlapBusy &&
                                      visibleMembers.size === 1
                                    ) {
                                      e.stopPropagation();
                                      setBlocks(
                                        blocks.filter((b) => b.id !== block.id)
                                      );
                                    }
                                  }}
                                  className="flex-1 flex items-center justify-center w-full"
                                >
                                  <span className="text-xs font-medium text-gray-700 pointer-events-none">
                                    {visibleCount === 1
                                      ? block.status === "available"
                                        ? "Free"
                                        : "Busy"
                                      : getMemberName(block.userId).split(
                                          " "
                                        )[0]}
                                  </span>
                                </div>

                                {isMyBlock &&
                                  !showOnlyOverlapFree &&
                                  !showOnlyOverlapBusy &&
                                  visibleMembers.size === 1 &&
                                  blockHeight >= 16 && (
                                    <div
                                      className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize hover:bg-black hover:bg-opacity-30 z-20 opacity-0 group-hover:opacity-100 transition"
                                      onMouseDown={(e) =>
                                        startResize(
                                          e,
                                          block.id,
                                          "bottom",
                                          block.day
                                        )
                                      }
                                    />
                                  )}
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
    </div>
  );
}
