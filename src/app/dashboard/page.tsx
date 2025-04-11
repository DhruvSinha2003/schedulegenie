// app/dashboard/page.tsx
"use client";

import TaskInputForm from "@/components/TaskInputForm"; // Ensure this path is correct
import { useUser } from "@auth0/nextjs-auth0/client";
import { useCallback, useEffect, useState } from "react";
import { FaSpinner } from "react-icons/fa";

// --- Interfaces ---
interface ScheduleTask {
  id: string;
  content: string;
  time: string;
  // Add day, notes if you plan to display them on the card
}

interface ScheduleColumn {
  id: string;
  title: string;
  tasks: ScheduleTask[];
}

interface ScheduleInputData {
  tasks: string;
  availability: string;
  flexibility: "rigid" | "flexible";
}

// Expected API response structure from GET /api/get-schedule and POST /api/generate-schedule
interface ScheduleApiResponse {
  schedule: Array<{
    id?: string;
    content?: string;
    day?: string;
    time?: string;
    notes?: string;
  }>;
  notes?: string | null; // Overall notes might be present
  // dbSaveWarning?: string; // Example if adding warning from generate API
}

// --- Component ---
export default function Dashboard() {
  const { user, isLoading: userLoading, error: userError } = useUser();
  const [scheduleColumns, setScheduleColumns] = useState<ScheduleColumn[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true); // Start true for initial load
  const [error, setError] = useState<string | null>(null);
  const [scheduleNotes, setScheduleNotes] = useState<string | null>(null); // Store overall notes

  // --- useCallback to process schedule data ---
  const processScheduleData = useCallback(
    (data: ScheduleApiResponse | null) => {
      setScheduleNotes(data?.notes || null); // Store overall notes

      if (!data || !data.schedule || data.schedule.length === 0) {
        setScheduleColumns([]);
        return;
      }

      const columnsMap: { [key: string]: ScheduleColumn } = {};
      data.schedule.forEach((task, index) => {
        const day = task.day || `Day ${index + 1}`; // Fallback title if day is missing
        const columnId = day.toLowerCase().replace(/\s+/g, "-");

        if (!columnsMap[columnId]) {
          columnsMap[columnId] = { id: columnId, title: day, tasks: [] };
        }
        columnsMap[columnId].tasks.push({
          id: task.id || `task-${Date.now()}-${index}`, // Ensure unique ID
          content: task.content || "Unnamed Task",
          time: task.time || "Unspecified Time",
          // Add notes: task.notes if needed
        });
      });
      setScheduleColumns(Object.values(columnsMap));
    },
    []
  );

  // --- useEffect to load schedule on mount ---
  useEffect(() => {
    // Defined inside useEffect to capture current 'user' value correctly
    const fetchSchedule = async () => {
      // No need to check user here again, outer check handles it
      setIsLoadingSchedule(true);
      setError(null);
      setScheduleNotes(null); // Clear old notes
      console.log("Dashboard: Attempting to fetch schedule...");
      try {
        const response = await fetch("/api/get-schedule"); // Ensure this URL is correct
        console.log(`Dashboard: Fetch response status: ${response.status}`);
        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch {
            // Handle cases where response is not JSON
            errorData = {
              message: `Failed to fetch schedule. Status: ${response.status}`,
            };
          }
          throw new Error(
            errorData?.message || `HTTP error! status: ${response.status}`
          );
        }
        const result: ScheduleApiResponse = await response.json();
        console.log("Dashboard: Received schedule data:", result);
        processScheduleData(result);
      } catch (err: any) {
        console.error("Dashboard: Error fetching schedule:", err);
        setError("Could not load your saved schedule. " + err.message);
        setScheduleColumns([]); // Clear schedule on error
      } finally {
        setIsLoadingSchedule(false);
        console.log("Dashboard: Finished fetching schedule.");
      }
    };

    // Fetch only when user is loaded and exists
    if (!userLoading && user) {
      fetchSchedule();
    } else if (!userLoading && !user) {
      // User loaded but is null (logged out state) - ensure loading is false
      setIsLoadingSchedule(false);
      setScheduleColumns([]); // Clear any stale data
      setScheduleNotes(null);
      console.log("Dashboard: User not logged in, skipping schedule fetch.");
    }
    // Add processScheduleData to dependency array as it's used inside
  }, [user, userLoading, processScheduleData]);

  // --- Function to handle generate button ---
  const handleGenerateSchedule = async (data: ScheduleInputData) => {
    setIsGenerating(true);
    setError(null);
    setScheduleNotes(null); // Clear old notes
    console.log("Dashboard: Attempting to generate schedule...");

    try {
      const response = await fetch("/api/generate-schedule", {
        // Ensure URL is correct
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      console.log(`Dashboard: Generate response status: ${response.status}`);

      const result: ScheduleApiResponse = await response.json(); // Try to parse JSON regardless of status for error messages

      if (!response.ok) {
        throw new Error(
          result?.message || `HTTP error! status: ${response.status}`
        );
      }

      console.log("Dashboard: Received generated schedule:", result);
      processScheduleData(result);
    } catch (err: any) {
      console.error("Dashboard: Error generating schedule:", err);
      setError(
        err.message || "An unexpected error occurred during generation."
      );
      // Optionally clear the board on generation error? Or leave old one?
      // setScheduleColumns([]);
    } finally {
      setIsGenerating(false);
      console.log("Dashboard: Finished generating schedule attempt.");
    }
  };

  // --- Render Logic ---
  if (userLoading)
    return (
      <div className="flex justify-center items-center min-h-screen">
        <FaSpinner className="animate-spin text-4xl text-indigo-500" />
        <span> Loading user...</span>
      </div>
    );
  if (userError)
    return (
      <div className="p-10 text-center text-red-500">
        Auth Error: {userError.message}
      </div>
    );
  // No need for !user check here if using withPageAuthRequired or middleware,
  // but we'll keep UI structure simple relying on the loading states

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 sm:p-8">
      {/* --- Header --- */}
      <header className="mb-8 flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 bg-white p-4 rounded-lg shadow">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
          Studio<span className="text-indigo-600">Genie</span>
        </h1>
        {user && (
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
        )}
        {!user &&
          !userLoading && ( // Show login link if user is loaded and not present
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
          <TaskInputForm
            onSubmit={handleGenerateSchedule}
            isGenerating={isGenerating}
          />
        </div>

        {/* Column 2: Schedule Board */}
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-lg min-h-[60vh]">
          <h2 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2">
            Generated Schedule
          </h2>
          {/* Loading States */}
          {isLoadingSchedule && (
            <div className="flex justify-center items-center h-full">
              <FaSpinner className="animate-spin text-3xl text-indigo-500" />
              <p className="ml-3 text-gray-600">Loading schedule...</p>
            </div>
          )}
          {isGenerating &&
            !isLoadingSchedule && ( // Show only if not initial loading
              <div className="flex justify-center items-center h-full">
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
                    className="bg-gray-100 rounded-lg p-3 min-w-[280px] flex-shrink-0"
                  >
                    <h3 className="font-semibold text-gray-700 mb-3 px-1">
                      {column.title}
                    </h3>
                    <div className="space-y-3">
                      {column.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="bg-white rounded-md p-3 shadow hover:shadow-md transition-shadow cursor-grab"
                        >
                          <p className="text-sm font-medium text-gray-800">
                            {task.content}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {task.time}
                          </p>
                          {/* Add task notes here if needed */}
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
          {!isLoadingSchedule &&
            !isGenerating &&
            scheduleColumns.length === 0 && (
              <div className="flex justify-center items-center h-full text-gray-400">
                <p>
                  Enter tasks and generate a schedule, or load your previous
                  one.
                </p>
              </div>
            )}
        </div>
      </div>
    </main>
  );
}
