"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Define the structure for an availability block
type AvailabilityBlock = {
  id: string;
  day: string;
  startHour: number;
  endHour: number;
  status: "available" | "busy";
};

type WeeklyCalendarProps = {
  groupId: string;
  userId: string;
};

/**
 * WeeklyCalendar Component - Interactive schedule grid
 * Allows users to mark their availability by day and time
 */
export default function WeeklyCalendar({
  groupId,
  userId,
}: WeeklyCalendarProps) {
  // Calendar configuration
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const hours = Array.from({ length: 14 }, (_, i) => i + 8); // 8am to 9pm (14 hours)

  const supabase = createClient();

  // State to store availability blocks
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [nextId, setNextId] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Drag state for multi-select
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

  /**
   * Formats hour number to display time (e.g., 8 -> "8:00 AM")
   */
  const formatHour = (hour: number) => {
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  /**
   * Converts day name to numeric index (0 = Sunday, 6 = Saturday)
   */
  const dayToIndex = (day: string) => {
    return days.indexOf(day);
  };

  /**
   * Saves availability blocks to database
   */
  const handleSave = async () => {
    setSaving(true);
    setSaveMessage("");

    try {
      // Delete existing availability for this user in this group
      const { error: deleteError } = await supabase
        .from("availability")
        .delete()
        .eq("user_id", userId)
        .eq("group_id", groupId);

      if (deleteError) throw deleteError;

      // Convert blocks to database format
      const availabilityRecords = blocks.map((block) => ({
        user_id: userId,
        group_id: groupId,
        day_of_week: dayToIndex(block.day),
        start_time: `${block.startHour.toString().padStart(2, "0")}:00:00`,
        end_time: `${block.endHour.toString().padStart(2, "0")}:00:00`,
        status: block.status,
      }));

      // Insert new availability records
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

  /**
   * Checks if a specific time slot has a block
   */
  const hasBlock = (day: string, hour: number) => {
    return blocks.some(
      (block) =>
        block.day === day && hour >= block.startHour && hour < block.endHour
    );
  };

  /**
   * Checks if a cell is in the current drag selection
   */
  const isInDragSelection = (day: string, hour: number) => {
    if (!isDragging || !dragStartCell || !dragCurrentCell) return false;

    // Only allow dragging within the same day
    if (day !== dragStartCell.day) return false;

    const minHour = Math.min(dragStartCell.hour, dragCurrentCell.hour);
    const maxHour = Math.max(dragStartCell.hour, dragCurrentCell.hour);

    return hour >= minHour && hour <= maxHour;
  };

  /**
   * Handles mouse down on a cell - starts drag operation
   */
  const handleMouseDown = (day: string, hour: number) => {
    setIsDragging(true);
    setDragStartCell({ day, hour });
    setDragCurrentCell({ day, hour });

    // Determine if we're adding or removing based on current state
    setDragMode(hasBlock(day, hour) ? "remove" : "add");
  };

  /**
   * Handles mouse enter on a cell - updates drag selection
   */
  const handleMouseEnter = (day: string, hour: number) => {
    if (isDragging && dragStartCell && day === dragStartCell.day) {
      setDragCurrentCell({ day, hour });
    }
  };

  /**
   * Handles mouse up - finishes drag operation
   */
  const handleMouseUp = () => {
    if (isDragging && dragStartCell && dragCurrentCell) {
      const minHour = Math.min(dragStartCell.hour, dragCurrentCell.hour);
      const maxHour = Math.max(dragStartCell.hour, dragCurrentCell.hour);

      if (dragMode === "add") {
        // Remove any existing blocks in the range
        const filteredBlocks = blocks.filter(
          (block) =>
            !(
              block.day === dragStartCell.day &&
              block.startHour >= minHour &&
              block.endHour <= maxHour + 1
            )
        );

        // Create a single block spanning the selected range
        const newBlock: AvailabilityBlock = {
          id: `${dragStartCell.day}-${minHour}-${nextId}`,
          day: dragStartCell.day,
          startHour: minHour,
          endHour: maxHour + 1,
          status: "available",
        };

        setBlocks([...filteredBlocks, newBlock]);
        setNextId(nextId + 1);
      } else {
        // Remove blocks in the selected range
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

    // Reset drag state
    setIsDragging(false);
    setDragStartCell(null);
    setDragCurrentCell(null);
  };

  /**
   * Gets the block color based on status
   */
  const getBlockColor = (status: "available" | "busy") => {
    return status === "available"
      ? "bg-green-200 border-green-400"
      : "bg-red-200 border-red-400";
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Instructions and Save button */}
      <div className="p-4 bg-blue-50 border-b border-blue-200 flex justify-between items-center">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> Click and drag vertically to select multiple
          hours at once.
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Schedule"}
        </button>
      </div>

      {/* Save message */}
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

      {/* Calendar grid container */}
      <div
        className="overflow-x-auto"
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="min-w-[800px] select-none">
          {/* Header row with day names */}
          <div className="grid grid-cols-8 border-b border-gray-200">
            {/* Empty cell for time column */}
            <div className="bg-gray-50 p-2 border-r border-gray-200"></div>

            {/* Day headers */}
            {days.map((day) => (
              <div
                key={day}
                className="bg-gray-50 p-2 text-center font-semibold text-gray-700 border-r border-gray-200 last:border-r-0"
              >
                {day.slice(0, 3)}
              </div>
            ))}
          </div>

          {/* Time slots grid - with relative positioning for blocks */}
          <div className="relative">
            {hours.map((hour) => (
              <div
                key={hour}
                className="grid grid-cols-8 border-b border-gray-200 last:border-b-0"
              >
                {/* Time label */}
                <div className="bg-gray-50 p-2 text-sm text-gray-600 border-r border-gray-200 flex items-center h-16  -mt-7.5">
                  {formatHour(hour)}
                </div>

                {/* Time slot cells for each day */}
                {days.map((day) => {
                  const inDragSelection = isInDragSelection(day, hour);

                  return (
                    <div
                      key={`${day}-${hour}`}
                      onMouseDown={() => handleMouseDown(day, hour)}
                      onMouseEnter={() => handleMouseEnter(day, hour)}
                      className={`relative h-16 border-r border-gray-200 last:border-r-0 cursor-pointer transition ${
                        inDragSelection ? "bg-blue-100" : "hover:bg-blue-50"
                      }`}
                    >
                      {/* Render blocks that START at this hour */}
                      {blocks
                        .filter(
                          (block) =>
                            block.day === day && block.startHour === hour
                        )
                        .map((block) => {
                          const blockHeight =
                            (block.endHour - block.startHour) * 64; // 64px per hour (h-16)
                          return (
                            <div
                              key={block.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setBlocks(
                                  blocks.filter((b) => b.id !== block.id)
                                );
                              }}
                              className={`absolute left-0 right-0 top-0 ${getBlockColor(
                                block.status
                              )} border-2 flex items-center justify-center z-10`}
                              style={{ height: `${blockHeight}px` }}
                            >
                              <span className="text-xs font-medium text-gray-700">
                                {block.status === "available" ? "Free" : "Busy"}
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

      {/* Legend */}
      <div className="p-4 bg-gray-50 border-t border-gray-200 flex gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-green-200 border-2 border-green-400 rounded"></div>
          <span className="text-sm text-gray-700">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-red-200 border-2 border-red-400 rounded"></div>
          <span className="text-sm text-gray-700">Busy</span>
        </div>
      </div>
    </div>
  );
}
