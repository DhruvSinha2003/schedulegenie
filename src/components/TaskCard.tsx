// components/TaskCard.tsx
"use client";

import { Task } from "@/types/task";
import Link from "next/link";
import { useMemo } from "react"; // Import useMemo
import {
  FaEdit,
  FaRegCheckSquare,
  FaRegSquare,
  FaRobot,
  FaSpinner,
  FaTrashAlt,
} from "react-icons/fa";

interface TaskCardProps {
  task: Task;
  onToggleComplete: (taskId: string, currentStatus: boolean) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onEdit: (task: Task) => void;
  isPending: boolean;
}

export default function TaskCard({
  task,
  onToggleComplete,
  onDelete,
  onEdit,
  isPending,
}: TaskCardProps) {
  // Calculate display day name using useMemo for efficiency
  const displayDayName = useMemo(() => {
    try {
      const date = new Date(task.day);
      // Check if the date is valid AND the input wasn't *just* a number (like '2024')
      if (!isNaN(date.getTime()) && !/^\d+$/.test(task.day.trim())) {
        return date.toLocaleDateString("en-US", { weekday: "short" }); // e.g., "Mon"
      }
    } catch (e) {
      // Ignore errors, means task.day is not a standard parsable date string
    }
    // If not a valid date, return empty string (or could try matching 'Monday', 'Tuesday' etc.)
    return "";
  }, [task.day]);

  const handleToggle = () => {
    if (!isPending) onToggleComplete(task.taskId, task.isCompleted);
  };
  const handleDelete = () => {
    if (!isPending) onDelete(task.taskId);
  };
  const handleEdit = () => {
    if (!isPending) onEdit(task);
  };

  return (
    <div
      className={`bg-white rounded-md p-3 shadow hover:shadow-md transition-shadow flex items-start space-x-3 ${
        task.isCompleted ? "opacity-60" : ""
      } ${isPending ? "cursor-wait opacity-70" : ""}`}
    >
      {/* Checkbox / Spinner */}
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`flex-shrink-0 mt-1 text-lg ${
          isPending
            ? "text-gray-400"
            : task.isCompleted
            ? "text-green-500"
            : "text-gray-400 hover:text-green-600"
        }`}
        title={task.isCompleted ? "Mark as incomplete" : "Mark as complete"}
        aria-label={
          task.isCompleted ? "Mark as incomplete" : "Mark as complete"
        }
      >
        {isPending ? (
          <FaSpinner className="animate-spin" />
        ) : task.isCompleted ? (
          <FaRegCheckSquare />
        ) : (
          <FaRegSquare />
        )}
      </button>

      {/* Task Content */}
      <div className="flex-grow min-w-0">
        <p
          className={`text-sm font-medium text-gray-800 break-words ${
            task.isCompleted ? "line-through" : ""
          }`}
        >
          {task.content}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {/* Display calculated day name if available, then original day/date */}
          {displayDayName ? `${displayDayName}, ` : ""}
          {task.day} • {task.time}
        </p>
        {task.notes && (
          <p className="text-xs italic text-gray-400 mt-1 break-words">
            Notes: {task.notes}
          </p>
        )}
      </div>

      {/* Action Buttons Group / Spinner */}
      <div className="flex flex-col items-center space-y-1 ml-auto flex-shrink-0 pl-1">
        {isPending ? (
          <FaSpinner className="animate-spin text-gray-400 mt-1" size={14} />
        ) : (
          <>
            <button
              onClick={handleEdit}
              className="text-gray-400 hover:text-blue-500 transition-colors p-1"
              title="Edit task"
              aria-label="Edit task"
              disabled={isPending}
            >
              <FaEdit size={15} />
            </button>
            <Link
              href={`/chat/${task.taskId}`}
              className={`text-blue-500 hover:text-blue-700 transition-colors p-1 ${
                isPending ? "pointer-events-none opacity-50" : ""
              }`}
              title="Get AI help with this task"
              aria-label="AI Assistant Chat"
              onClick={(e) => {
                if (isPending) e.preventDefault();
              }}
              aria-disabled={isPending}
              tabIndex={isPending ? -1 : 0}
            >
              <FaRobot size={16} />
            </Link>
            <button
              onClick={handleDelete}
              className="text-gray-400 hover:text-red-500 transition-colors p-1"
              title="Delete task"
              aria-label="Delete task"
              disabled={isPending}
            >
              <FaTrashAlt size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
