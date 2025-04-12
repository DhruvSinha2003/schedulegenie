// app/dashboard/page.tsx
"use client";

import EditTaskModal from "@/components/EditTaskModal";
import TaskCard from "@/components/TaskCard";
import TaskInputForm from "@/components/TaskInputForm";
import { Task } from "@/types/task";
import { useUser } from "@auth0/nextjs-auth0/client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react"; // Added useMemo
import { FaSpinner } from "react-icons/fa";

// --- Interfaces ---
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
  // REMOVED: const [scheduleColumns, setScheduleColumns] = useState<ScheduleColumn[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleNotes, setScheduleNotes] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [pendingTaskActions, setPendingTaskActions] = useState<
    Record<string, "toggle" | "delete" | "edit">
  >({});

  const hasFetchedRef = useRef(false);

  const dayOrder: { [key: string]: number } = useMemo(
    () => ({
      // useMemo for stable definition if ever needed elsewhere
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    }),
    []
  );

  // --- Calculate schedule columns directly using useMemo ---
  const scheduleColumns = useMemo(() => {
    if (!allTasks || allTasks.length === 0) {
      return [];
    }
    const columnsMap: { [key: string]: ScheduleColumn } = {};

    // Sort tasks robustly by date (if parseable) then day name, then time
    const sortedTasks = [...allTasks].sort((a, b) => {
      const dateA = new Date(a.day);
      const dateB = new Date(b.day);
      const isValidDateA = !isNaN(dateA.getTime());
      const isValidDateB = !isNaN(dateB.getTime());
      const dayNumA = dayOrder[a.day?.toLowerCase()] ?? 7;
      const dayNumB = dayOrder[b.day?.toLowerCase()] ?? 7;

      if (isValidDateA && isValidDateB) {
        if (dateA.getTime() !== dateB.getTime())
          return dateA.getTime() - dateB.getTime();
      } else if (isValidDateA) {
        return -1;
      } else if (isValidDateB) {
        return 1;
      } else if (dayNumA !== dayNumB) {
        return dayNumA - dayNumB;
      }
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

    // Order columns based on the first task's appearance
    const orderedColumns = Object.values(columnsMap).sort((colA, colB) => {
      const firstTaskAIndex = sortedTasks.findIndex(
        (t) => (t.day || "Unspecified Day") === colA.title
      );
      const firstTaskBIndex = sortedTasks.findIndex(
        (t) => (t.day || "Unspecified Day") === colB.title
      );
      return (
        (firstTaskAIndex === -1 ? Infinity : firstTaskAIndex) -
        (firstTaskBIndex === -1 ? Infinity : firstTaskBIndex)
      );
    });
    return orderedColumns; // Return the calculated columns
  }, [allTasks, dayOrder]); // Dependencies for useMemo

  // --- Fetch schedule ---
  useEffect(() => {
    const fetchSchedule = async () => {
      if (hasFetchedRef.current || !user) return;
      hasFetchedRef.current = true;
      setIsLoadingSchedule(true);
      setError(null);
      setPendingTaskActions({});

      try {
        const response = await fetch("/api/get-schedule");
        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({
              message: `HTTP error! status: ${response.status}`,
            }));
          throw new Error(errorData.message || "Failed to load schedule");
        }
        const result: ScheduleApiResponse = await response.json();
        setAllTasks(result.tasks || []); // Update allTasks state
        setScheduleNotes(result.notes || null);
        // No need to call processTasksIntoColumns or setScheduleColumns here anymore
      } catch (err: any) {
        setError("Could not load your saved schedule. " + err.message);
        setAllTasks([]);
        setScheduleNotes(null);
      } finally {
        setIsLoadingSchedule(false);
      }
    };

    if (!userLoading) {
      if (user) {
        fetchSchedule();
      } else {
        hasFetchedRef.current = false;
        setAllTasks([]);
        setScheduleNotes(null);
        setError(null);
        setIsLoadingSchedule(false);
        setPendingTaskActions({});
        setIsEditModalOpen(false);
        setEditingTask(null);
      }
    }
  }, [user, userLoading]); // Removed processTasksIntoColumns from dependency array

  // --- Handler for generating a schedule ---
  const handleGenerateSchedule = async (data: ScheduleInputData) => {
    if (!user) return;
    setIsGenerating(true);
    setError(null);
    setPendingTaskActions({});

    try {
      const response = await fetch("/api/generate-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Failed to parse error response" }));
        throw new Error(errorData.message || "Failed to generate schedule");
      }

      const result: ScheduleApiResponse = await response.json();
      setAllTasks(result.tasks || []); // Update allTasks state
      setScheduleNotes(result.notes || null);
      // scheduleColumns will update automatically via useMemo
    } catch (err: any) {
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
    setError(null);
    setPendingTaskActions((prev) => ({ ...prev, [taskId]: "toggle" }));

    try {
      const newStatus = !currentStatus;
      const response = await fetch(`/api/update-task`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: taskId, isCompleted: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Failed to update task status." }));
        throw new Error(
          errorData.message || "Server error updating task status."
        );
      }

      // Update allTasks state - UI will update via useMemo
      setAllTasks((prevTasks) =>
        prevTasks.map((task) =>
          task.taskId === taskId ? { ...task, isCompleted: newStatus } : task
        )
      );
    } catch (err: any) {
      setError("Could not update task status: " + err.message);
    } finally {
      setPendingTaskActions((prev) => {
        const newState = { ...prev };
        delete newState[taskId];
        return newState;
      });
    }
  };

  // --- Handler for deleting a task ---
  const handleDeleteTask = async (taskId: string) => {
    if (!user) return;
    const taskToDelete = allTasks.find((t) => t.taskId === taskId);
    if (!taskToDelete) return;
    if (
      !window.confirm(
        `Are you sure you want to delete task: "${taskToDelete.content}"?`
      )
    ) {
      return;
    }
    setError(null);
    setPendingTaskActions((prev) => ({ ...prev, [taskId]: "delete" }));

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
          .catch(() => ({ message: "Failed to delete task." }));
        throw new Error(errorData.message || "Server error deleting task.");
      }

      // Update allTasks state - UI will update via useMemo
      setAllTasks((prevTasks) =>
        prevTasks.filter((task) => task.taskId !== taskId)
      );
    } catch (err: any) {
      setError("Could not delete task: " + err.message);
    } finally {
      setPendingTaskActions((prev) => {
        const newState = { ...prev };
        delete newState[taskId];
        return newState;
      });
    }
  };

  // --- Handlers for Edit Modal ---
  const handleOpenEditModal = (task: Task) => {
    setEditingTask(task);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingTask(null);
  };

  const handleSaveTask = async (taskId: string, updates: Partial<Task>) => {
    if (!user || !editingTask) return;
    setError(null);
    setPendingTaskActions((prev) => ({ ...prev, [taskId]: "edit" }));

    try {
      const response = await fetch(`/api/edit-task`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: taskId, updates: updates }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Failed to save task changes." }));
        throw new Error(
          errorData.message || "Server error saving task changes."
        );
      }

      // Update allTasks state - UI will update via useMemo
      setAllTasks((prevTasks) =>
        prevTasks.map((task) =>
          task.taskId === taskId ? { ...task, ...updates } : task
        )
      );
      handleCloseEditModal(); // Close modal on success
    } catch (err: any) {
      console.error("Error saving task:", err);
      throw err; // Re-throw for modal to display
    } finally {
      setPendingTaskActions((prev) => {
        const newState = { ...prev };
        delete newState[taskId];
        return newState;
      });
    }
  };

  // --- REMOVED useEffect that called processTasksIntoColumns ---

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
            Generate Schedule
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
          {/* Use the memoized scheduleColumns directly */}
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
                        <TaskCard
                          key={task.taskId}
                          task={task}
                          onToggleComplete={handleToggleComplete}
                          onDelete={handleDeleteTask}
                          onEdit={handleOpenEditModal}
                          isPending={!!pendingTaskActions[task.taskId]}
                        />
                      ))}
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
                  <p>No tasks scheduled yet. Use the form to generate tasks.</p>
                ) : (
                  <p>Please log in to view or generate your schedule.</p>
                )}
              </div>
            )}
        </div>
      </div>

      {/* Edit Task Modal */}
      <EditTaskModal
        isOpen={isEditModalOpen}
        task={editingTask}
        onClose={handleCloseEditModal}
        onSave={handleSaveTask}
      />
    </main>
  );
}
