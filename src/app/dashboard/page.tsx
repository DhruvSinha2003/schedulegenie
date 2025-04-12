// app/dashboard/page.tsx
"use client";

import TaskInputForm from "@/components/TaskInputForm"; // Ensure this path is correct
import { useUser } from "@auth0/nextjs-auth0/client";
import { useCallback, useEffect, useState } from "react";
import {
  FaRegCheckSquare,
  FaRegSquare,
  FaSpinner,
  FaTrashAlt,
} from "react-icons/fa";

// --- Interfaces ---
interface Task {
  taskId: string;
  content: string;
  day: string;
  time: string;
  timestamp: string | null;
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
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleNotes, setScheduleNotes] = useState<string | null>(null);

  // --- useCallback to process tasks into columns ---
  const processTasksIntoColumns = useCallback((tasks: Task[]) => {
    if (!tasks || tasks.length === 0) {
      setScheduleColumns([]);
      return;
    }

    const columnsMap: { [key: string]: ScheduleColumn } = {};
    const sortedTasks = tasks.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : Infinity;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : Infinity;
      if (timeA === timeB) {
        return (a.day + a.time).localeCompare(b.day + b.time);
      }
      return timeA - timeB;
    });

    sortedTasks.forEach((task) => {
      const day = task.day || "Unspecified Day";
      const columnId = day.toLowerCase().replace(/\s+/g, "-");

      if (!columnsMap[columnId]) {
        columnsMap[columnId] = { id: columnId, title: day, tasks: [] };
      }
      columnsMap[columnId].tasks.push(task);
    });
    setScheduleColumns(Object.values(columnsMap));
  }, []);

  // --- useEffect to load schedule on mount ---
  useEffect(() => {
    const fetchSchedule = async () => {
      setIsLoadingSchedule(true);
      setError(null);
      setScheduleNotes(null);
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
        console.error("Dashboard: Error fetching schedule:", err);
        setError("Could not load your saved schedule. " + err.message);
        setAllTasks([]);
        setScheduleColumns([]);
      } finally {
        setIsLoadingSchedule(false);
      }
    };

    if (!userLoading && user) {
      fetchSchedule();
    } else if (!userLoading && !user) {
      setIsLoadingSchedule(false);
      setAllTasks([]);
      setScheduleColumns([]);
    }
  }, [user, userLoading, processTasksIntoColumns]);

  // --- Handler for Generating Schedule ---
  const handleGenerateSchedule = async (data: ScheduleInputData) => {
    setIsGenerating(true);
    setError(null);
    setScheduleNotes(null);
    try {
      const response = await fetch("/api/generate-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result: ScheduleApiResponse = await response.json();
      if (!response.ok) {
        // Use notes field from response for error message if available
        throw new Error(
          result?.notes || `HTTP error! status: ${response.status}`
        );
      }
      setAllTasks(result.tasks || []);
      setScheduleNotes(result.notes || null);
      processTasksIntoColumns(result.tasks || []);
    } catch (err: any) {
      console.error("Dashboard: Error generating schedule:", err);
      setError(
        err.message || "An unexpected error occurred during generation."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Handler for Toggling Task Completion ---
  const handleToggleComplete = async (
    taskId: string,
    currentStatus: boolean
  ) => {
    const newStatus = !currentStatus;
    const originalTasks = [...allTasks]; // Optimistic UI backup

    // Optimistic UI Update
    const updatedTasks = allTasks.map((task) =>
      task.taskId === taskId ? { ...task, isCompleted: newStatus } : task
    );
    setAllTasks(updatedTasks);
    processTasksIntoColumns(updatedTasks); // Update columns based on new task state

    // API Call
    try {
      const response = await fetch("/api/update-task", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, isCompleted: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Update failed." }));
        throw new Error(errorData.message);
      }
      console.log(`Task ${taskId} status updated to ${newStatus}`);
    } catch (err: any) {
      console.error("Error updating task status:", err);
      setError(`Failed to update task: ${err.message}. Reverting.`);
      // Revert UI on error
      setAllTasks(originalTasks);
      processTasksIntoColumns(originalTasks); // Revert columns as well
    }
  };

  // --- Handler for Deleting Task ---
  const handleDeleteTask = async (taskId: string) => {
    const taskToDelete = allTasks.find((t) => t.taskId === taskId);
    if (!taskToDelete) return;

    if (
      !window.confirm(
        `Are you sure you want to delete task: "${taskToDelete.content}"?`
      )
    ) {
      return;
    }

    const originalTasks = [...allTasks]; // Optimistic UI backup

    // Optimistic UI Update
    const updatedTasks = allTasks.filter((task) => task.taskId !== taskId);
    setAllTasks(updatedTasks);
    processTasksIntoColumns(updatedTasks); // Update columns

    // API Call
    try {
      const response = await fetch(
        `/api/delete-task?taskId=${encodeURIComponent(taskId)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Delete failed." }));
        throw new Error(errorData.message);
      }
      console.log(`Task ${taskId} deleted`);
    } catch (err: any) {
      console.error("Error deleting task:", err);
      setError(`Failed to delete task: ${err.message}. Reverting.`);
      // Revert UI on error
      setAllTasks(originalTasks);
      processTasksIntoColumns(originalTasks); // Revert columns
    }
  };

  // --- Render Logic ---
  // Handle Auth0 loading state first
  if (userLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <FaSpinner className="animate-spin text-4xl text-indigo-500" />
        <span> Loading user...</span>
      </div>
    );
  }

  // Handle Auth0 error state
  if (userError) {
    return (
      <div className="p-10 text-center text-red-500">
        Auth Error: {userError.message}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 sm:p-8">
      {/* --- Header --- */}
      <header className="mb-8 flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 bg-white p-4 rounded-lg shadow">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
          Studio<span className="text-indigo-600">Genie</span>
        </h1>
        {/* Conditionally render user info or login button */}
        {user ? (
          <div className="flex items-center space-x-4">
            {user.picture && (
              <img
                src={user.picture}
                alt={user.name || "User"}
                className="w-10 h-10 rounded-full border-2 border-indigo-500"
              />
            )}
            <span className="text-gray-700 hidden sm:inline">
              Hi, {user.name || user.nickname}!
            </span>
            <a
              href="/api/auth/logout"
              className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors"
            >
              Logout
            </a>
          </div>
        ) : (
          <a
            href="/api/auth/login"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Login
          </a>
        )}
      </header>

      {/* --- General Error Display --- */}
      {error && (
        <div
          className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded"
          role="alert"
        >
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}

      {/* --- Optional: Display Overall Schedule Notes --- */}
      {scheduleNotes && (
        <div
          className="mb-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded text-sm"
          role="alert"
        >
          <strong>Notes from AI:</strong> {scheduleNotes}
        </div>
      )}

      {/* --- Main Content Grid --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Input Area */}
        <div className="lg:col-span-1 bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2">
            Create Your Schedule
          </h2>
          {/* Render TaskInputForm only if user is logged in */}
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
          {isLoadingSchedule && (
            <div className="flex justify-center items-center h-64">
              <FaSpinner className="animate-spin text-3xl text-indigo-500" />
              <p className="ml-3 text-gray-600">Loading schedule...</p>
            </div>
          )}
          {isGenerating && !isLoadingSchedule && (
            <div className="flex justify-center items-center h-64">
              <FaSpinner className="animate-spin text-4xl text-indigo-500" />
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
                    className="bg-gray-100 rounded-lg p-3 min-w-[280px] max-w-[320px] flex-shrink-0"
                  >
                    <h3 className="font-semibold text-gray-700 mb-3 px-1 sticky top-0 bg-gray-100 py-1">
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

                          {/* Delete Button */}
                          <button
                            onClick={() => handleDeleteTask(task.taskId)}
                            className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors p-1 ml-2"
                            title="Delete task"
                            aria-label="Delete task"
                          >
                            <FaTrashAlt />
                          </button>
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
