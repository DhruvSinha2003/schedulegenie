// app/dashboard/page.tsx
"use client";

import TaskInputForm from "@/components/TaskInputForm";
import { useUser } from "@auth0/nextjs-auth0/client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaRegCheckSquare,
  FaRegSquare,
  FaRobot,
  FaSpinner,
  FaTrashAlt,
} from "react-icons/fa";

// --- Interfaces ---
interface Task {
  taskId: string;
  content: string;
  day: string;
  time: string;
  isCompleted: boolean;
  notes: string | null;
}
interface ScheduleColumn {
  id: string;
  title: string;
  tasks: Task[];
}
interface ScheduleInputData {
  tasks: string;
  availability: string;
  flexibility: "rigid" | "flexible";
}
interface ScheduleApiResponse {
  tasks: Task[];
  notes?: string | null;
}

// --- Component ---
export default function Dashboard() {
  const { user, isLoading: userLoading, error: userError } = useUser();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [scheduleColumns, setScheduleColumns] = useState<ScheduleColumn[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true); // Start true for initial load
  const [error, setError] = useState<string | null>(null);
  const [scheduleNotes, setScheduleNotes] = useState<string | null>(null);

  // Flag to prevent multiple fetches
  const hasFetchedRef = useRef(false);

  // --- Day of Week Mapping ---
  const dayOrder: { [key: string]: number } = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  // --- Process tasks into columns ---
  const processTasksIntoColumns = useCallback(
    (tasks: Task[]) => {
      if (!tasks || tasks.length === 0) {
        setScheduleColumns([]);
        return;
      }
      const columnsMap: { [key: string]: ScheduleColumn } = {};
      const sortedTasks = [...tasks].sort((a, b) => {
        const dateA = Date.parse(a.day);
        const dateB = Date.parse(b.day);
        const dayNumA = dayOrder[a.day?.toLowerCase()] ?? 7;
        const dayNumB = dayOrder[b.day?.toLowerCase()] ?? 7;
        if (!isNaN(dateA) && !isNaN(dateB)) {
          if (dateA !== dateB) return dateA - dateB;
        } else if (!isNaN(dateA)) return -1;
        else if (!isNaN(dateB)) return 1;
        else if (dayNumA !== dayNumB) return dayNumA - dayNumB;
        return (a.time || "").localeCompare(b.time || "");
      });

      sortedTasks.forEach((task) => {
        const dayTitle = task.day || "Unspecified Day";
        const columnId = dayTitle.toLowerCase().replace(/[^a-z0-9]/g, "-");
        if (!columnsMap[columnId]) {
          columnsMap[columnId] = { id: columnId, title: dayTitle, tasks: [] };
        }
        columnsMap[columnId].tasks.push(task);
      });

      const orderedColumns = Object.values(columnsMap).sort((colA, colB) => {
        const firstTaskA = sortedTasks.find(
          (t) => (t.day || "Unspecified Day") === colA.title
        );
        const firstTaskB = sortedTasks.find(
          (t) => (t.day || "Unspecified Day") === colB.title
        );
        const indexA = firstTaskA ? sortedTasks.indexOf(firstTaskA) : Infinity;
        const indexB = firstTaskB ? sortedTasks.indexOf(firstTaskB) : Infinity;
        return indexA - indexB;
      });
      setScheduleColumns(orderedColumns);
    },
    [dayOrder]
  );

  // --- Fetch schedule only once when user is loaded ---
  useEffect(() => {
    const fetchSchedule = async () => {
      // Skip if already fetched or no user
      if (hasFetchedRef.current || !user) {
        return;
      }

      hasFetchedRef.current = true;
      setIsLoadingSchedule(true);
      setError(null);

      try {
        const response = await fetch("/api/get-schedule");

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            message: `HTTP error! status: ${response.status}`,
          }));
          throw new Error(errorData.message);
        }

        const result: ScheduleApiResponse = await response.json();
        setAllTasks(result.tasks || []);
        setScheduleNotes(result.notes || null);
        processTasksIntoColumns(result.tasks || []);
      } catch (err: any) {
        console.error("Error fetching schedule:", err);
        setError("Could not load your saved schedule. " + err.message);
        setAllTasks([]);
        setScheduleColumns([]);
      } finally {
        setIsLoadingSchedule(false);
      }
    };

    // Only trigger fetch once user load completes
    if (!userLoading) {
      if (user) {
        fetchSchedule();
      } else {
        // Reset all states if user is not logged in
        setAllTasks([]);
        setScheduleColumns([]);
        setScheduleNotes(null);
        setError(null);
        setIsLoadingSchedule(false);
      }
    }
  }, [user, userLoading, processTasksIntoColumns]);

  // --- Handler for generating a schedule ---
  const handleGenerateSchedule = async (data: ScheduleInputData) => {
    if (!user) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/generate-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate schedule");
      }

      const result: ScheduleApiResponse = await response.json();
      setAllTasks(result.tasks || []);
      setScheduleNotes(result.notes || null);
      processTasksIntoColumns(result.tasks || []);
    } catch (err: any) {
      console.error("Error generating schedule:", err);
      setError("Could not generate schedule: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Handler for toggling task completion ---
  const handleToggleComplete = async (
    taskId: string,
    currentStatus: boolean
  ) => {
    if (!user) return;
    const originalTasks = [...allTasks]; // Backup for potential revert
    const newStatus = !currentStatus;

    // Optimistic UI update
    const updatedTasksOptimistic = originalTasks.map((task) =>
      task.taskId === taskId ? { ...task, isCompleted: newStatus } : task
    );
    setAllTasks(updatedTasksOptimistic);
    processTasksIntoColumns(updatedTasksOptimistic); // Update columns view
    setError(null); // Clear previous errors

    try {
      // *** FIX: Send PATCH to correct URL with body ***
      const response = await fetch(`/api/update-task`, {
        // URL is just /api/update-task
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Send taskId and new status in the BODY
        body: JSON.stringify({ taskId: taskId, isCompleted: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Failed to update task on server." }));
        throw new Error(errorData.message || "Server error updating task.");
      }
      // Success - UI is already updated optimistically
      console.log(`Task ${taskId} updated successfully to ${newStatus}`);
    } catch (err: any) {
      console.error("Error updating task:", err);
      setError("Could not update task: " + err.message + ". Reverting.");
      // Revert UI on failure
      setAllTasks(originalTasks);
      processTasksIntoColumns(originalTasks);
    }
  };

  // --- Handler for deleting a task ---
  const handleDeleteTask = async (taskId: string) => {
    if (!user) return;

    const taskToDelete = allTasks.find((t) => t.taskId === taskId);
    if (!taskToDelete) return;

    // Confirmation Dialog
    if (
      !window.confirm(
        `Are you sure you want to delete task: "${taskToDelete.content}"?`
      )
    ) {
      return;
    }

    const originalTasks = [...allTasks]; // Backup for revert

    // Optimistic UI update
    const updatedTasksOptimistic = originalTasks.filter(
      (task) => task.taskId !== taskId
    );
    setAllTasks(updatedTasksOptimistic);
    processTasksIntoColumns(updatedTasksOptimistic);
    setError(null); // Clear previous errors

    try {
      // *** FIX: Send DELETE to correct URL with query parameter ***
      const response = await fetch(
        `/api/delete-task?taskId=${encodeURIComponent(taskId)}`,
        {
          // URL includes query param
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Failed to delete task on server." }));
        throw new Error(errorData.message || "Server error deleting task.");
      }
      // Success - UI is already updated
      console.log(`Task ${taskId} deleted successfully`);
    } catch (err: any) {
      console.error("Error deleting task:", err);
      setError("Could not delete task: " + err.message + ". Reverting.");
      // Revert UI on failure
      setAllTasks(originalTasks);
      processTasksIntoColumns(originalTasks);
    }
  };

  // --- Render Logic ---
  if (userLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <FaSpinner className="animate-spin text-3xl text-indigo-500 mr-3" />
        <span className="text-gray-700">Loading user...</span>
      </div>
    );
  }

  if (userError) {
    return (
      <div className="p-10 text-center text-red-500">
        Auth Error: {userError.message}
      </div>
    );
  }

  // Main component return statement
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 sm:p-8">
      {/* Header */}
      <header className="mb-8 flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 bg-white p-4 rounded-lg shadow">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
          Schedule<span className="text-indigo-600">Genie</span>
        </h1>
        {user ? (
          <div className="flex items-center space-x-4">
            {user.picture && (
              <Image
                src={user.picture}
                alt={user.name || "User"}
                width={40}
                height={40}
                className="rounded-full border-2 border-indigo-500"
              />
            )}
            <span className="text-gray-700 hidden sm:inline">
              Hi, {user.name || user.nickname}!
            </span>
            <Link
              href="/api/auth/logout"
              className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors"
            >
              Logout
            </Link>
          </div>
        ) : (
          <Link
            href="/api/auth/login"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Login
          </Link>
        )}
      </header>

      {/* General Error Display */}
      {error && (
        <div
          className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded"
          role="alert"
        >
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}

      {/* Optional: Display Overall Schedule Notes */}
      {scheduleNotes && (
        <div
          className="mb-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded text-sm"
          role="alert"
        >
          <strong>Notes from AI:</strong> {scheduleNotes}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Input Area */}
        <div className="lg:col-span-1 bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2">
            Create Your Schedule
          </h2>
          {user ? (
            <TaskInputForm
              onSubmit={handleGenerateSchedule}
              isGenerating={isGenerating}
            />
          ) : (
            <p className="text-gray-500">Please log in to create a schedule.</p>
          )}
        </div>

        {/* Column 2: Schedule Board */}
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-lg min-h-[60vh]">
          <h2 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2">
            Your Schedule
          </h2>

          {/* Loading States */}
          {isLoadingSchedule && !userLoading && (
            <div className="flex justify-center items-center h-64">
              <FaSpinner className="animate-spin text-3xl text-indigo-500 mr-3" />
              <p className="ml-3 text-gray-600">Loading schedule...</p>
            </div>
          )}
          {isGenerating && !isLoadingSchedule && (
            <div className="flex justify-center items-center h-64">
              <FaSpinner className="animate-spin text-4xl text-indigo-500 mr-3" />
              <p className="ml-4 text-lg text-gray-600">
                Generating schedule...
              </p>
            </div>
          )}

          {/* Schedule Display or Placeholder */}
          {!isLoadingSchedule &&
            !isGenerating &&
            scheduleColumns.length > 0 && (
              <div className="flex space-x-4 overflow-x-auto pb-4">
                {scheduleColumns.map((column) => (
                  <div
                    key={column.id}
                    className="bg-gray-100 rounded-lg p-3 min-w-[280px] max-w-[320px] flex-shrink-0 self-start"
                  >
                    <h3 className="font-semibold text-gray-700 mb-3 px-1 sticky top-0 bg-gray-100 py-1 z-10">
                      {column.title}
                    </h3>
                    <div className="space-y-3">
                      {column.tasks.map((task) => (
                        <div
                          key={task.taskId}
                          className={`bg-white rounded-md p-3 shadow hover:shadow-md transition-shadow flex items-start space-x-3 ${
                            task.isCompleted ? "opacity-60" : ""
                          }`}
                        >
                          {/* Checkbox */}
                          <button
                            onClick={() =>
                              handleToggleComplete(
                                task.taskId,
                                task.isCompleted
                              )
                            }
                            className={`flex-shrink-0 mt-1 text-lg ${
                              task.isCompleted
                                ? "text-green-500"
                                : "text-gray-400 hover:text-green-600"
                            }`}
                            title={
                              task.isCompleted
                                ? "Mark as incomplete"
                                : "Mark as complete"
                            }
                            aria-label={
                              task.isCompleted
                                ? "Mark as incomplete"
                                : "Mark as complete"
                            }
                          >
                            {task.isCompleted ? (
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
                              {task.time}
                            </p>
                            {task.notes && (
                              <p className="text-xs italic text-gray-400 mt-1 break-words">
                                Notes: {task.notes}
                              </p>
                            )}
                          </div>
                          {/* Action Buttons Group */}
                          <div className="flex flex-col items-center space-y-2 ml-auto flex-shrink-0 pl-1">
                            <Link
                              href={`/chat/${task.taskId}`}
                              className="text-blue-500 hover:text-blue-700 transition-colors p-1"
                              title="Get AI help with this task"
                              aria-label="AI Assistant Chat"
                            >
                              <FaRobot size={16} />
                            </Link>
                            <button
                              onClick={() => handleDeleteTask(task.taskId)}
                              className="text-gray-400 hover:text-red-500 transition-colors p-1"
                              title="Delete task"
                              aria-label="Delete task"
                            >
                              <FaTrashAlt size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {column.tasks.length === 0 && (
                        <p className="text-xs text-gray-400 px-1">
                          No tasks scheduled here.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          {/* Placeholder when no tasks */}
          {!isLoadingSchedule &&
            !isGenerating &&
            scheduleColumns.length === 0 && (
              <div className="flex justify-center items-center h-64 text-gray-400">
                {user ? (
                  <p>
                    No tasks scheduled yet. Use the form to generate a schedule.
                  </p>
                ) : (
                  <p>Please log in to view or generate your schedule.</p>
                )}
              </div>
            )}
        </div>
      </div>
    </main>
  );
}
