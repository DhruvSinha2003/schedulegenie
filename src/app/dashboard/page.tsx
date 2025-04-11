// app/dashboard/page.tsx
"use client"; // Make the dashboard page a client component to manage state

import TaskInputForm from "@/components/TaskInputForm"; // Import the new form component
import { useUser } from "@auth0/nextjs-auth0/client"; // Keep using useUser for client-side user info
import { useEffect, useState } from "react"; // Import useState and useEffect
import { FaSpinner } from "react-icons/fa"; // Icon for loading state

// Define interfaces for the data structure
interface ScheduleTask {
  id: string; // Unique ID for the task
  content: string; // Task description
  time: string; // Assigned time block (e.g., "Monday 9:00 AM - 10:00 AM")
  // Add other relevant fields like date, tags if needed
}

interface ScheduleColumn {
  id: string; // e.g., 'monday', 'tuesday', 'time-9-10'
  title: string; // e.g., 'Monday', '9 AM - 10 AM'
  tasks: ScheduleTask[];
}

// Define the shape of the data expected from the API route
interface ScheduleInputData {
  tasks: string;
  availability: string;
  flexibility: "rigid" | "flexible";
}

export default function Dashboard() {
  const { user, isLoading: userLoading, error: userError } = useUser();
  const [scheduleColumns, setScheduleColumns] = useState<ScheduleColumn[]>([]); // State for the schedule board data
  const [isGenerating, setIsGenerating] = useState(false); // State for loading indicator
  const [error, setError] = useState<string | null>(null); // State for error messages

  // Function to handle form submission and call the API
  const handleGenerateSchedule = async (data: ScheduleInputData) => {
    setIsGenerating(true);
    setError(null); // Clear previous errors
    setScheduleColumns([]); // Clear previous schedule

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
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }

      const result = await response.json();
      console.log("Received schedule:", result); // Log for debugging

      // --- Process the result into the Trello board format ---
      // This part depends HEAVILY on the exact JSON structure Gemini returns.
      // Let's assume Gemini returns an array of tasks like:
      // { tasks: [ { id: 'task1', content: 'Do X', time: 'Mon 9-10 AM', date: '2024-07-29' }, ... ] }
      // We need to group these into columns (e.g., by Day or Time Block)

      // Example processing (ADAPT BASED ON ACTUAL GEMINI OUTPUT):
      const processedColumns: ScheduleColumn[] = [];
      if (result.schedule && Array.isArray(result.schedule)) {
        // Group by day for simplicity (you might group by time blocks)
        const columnsMap: { [key: string]: ScheduleColumn } = {};

        result.schedule.forEach((task: any, index: number) => {
          const day = task.day || `Day ${index + 1}`; // Extract day or use a fallback
          const columnId = day.toLowerCase().replace(/\s+/g, "-");

          if (!columnsMap[columnId]) {
            columnsMap[columnId] = { id: columnId, title: day, tasks: [] };
          }
          columnsMap[columnId].tasks.push({
            id: task.id || `task-${Date.now()}-${index}`, // Ensure unique ID
            content: task.content || "Unnamed Task",
            time: task.time || "Unspecified Time",
          });
        });
        processedColumns.push(...Object.values(columnsMap));
      } else {
        console.warn("Received unexpected schedule format:", result);
        setError("Failed to process the schedule format received from AI.");
      }
      setScheduleColumns(processedColumns);
    } catch (err: any) {
      console.error("Error generating schedule:", err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Auth0 loading/error states
  if (userLoading)
    return (
      <div className="flex justify-center items-center min-h-screen">
        <FaSpinner className="animate-spin text-4xl text-blue-500" />
      </div>
    );
  if (userError)
    return (
      <div className="p-10 text-center text-red-500">
        Auth Error: {userError.message}
      </div>
    );
  if (!user) {
    // This shouldn't ideally happen if withPageAuthRequired works, but good practice
    return <div className="p-10 text-center">Redirecting to login...</div>;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 sm:p-8">
      <header className="mb-8 flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 bg-white p-4 rounded-lg shadow">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
          Studio<span className="text-indigo-600">Genie</span>
        </h1>
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
      </header>

      {/* Display General Errors */}
      {error && (
        <div
          className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded"
          role="alert"
        >
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}

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
          {" "}
          {/* Added min-h for better visual */}
          <h2 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2">
            Generated Schedule
          </h2>
          {isGenerating ? (
            <div className="flex justify-center items-center h-full">
              <FaSpinner className="animate-spin text-4xl text-indigo-500" />
              <p className="ml-4 text-lg text-gray-600">
                Generating your schedule...
              </p>
            </div>
          ) : scheduleColumns.length > 0 ? (
            // --- Render the Trello-style Board ---
            // Using simple divs for now, can integrate react-beautiful-dnd later
            <div className="flex space-x-4 overflow-x-auto pb-4">
              {" "}
              {/* Horizontal scroll */}
              {scheduleColumns.map((column) => (
                <div
                  key={column.id}
                  className="bg-gray-100 rounded-lg p-3 min-w-[280px] flex-shrink-0"
                >
                  {" "}
                  {/* Column styling */}
                  <h3 className="font-semibold text-gray-700 mb-3 px-1">
                    {column.title}
                  </h3>
                  <div className="space-y-3">
                    {" "}
                    {/* Task list */}
                    {column.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="bg-white rounded-md p-3 shadow cursor-grab"
                      >
                        {" "}
                        {/* Card styling */}
                        <p className="text-sm font-medium text-gray-800">
                          {task.content}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {task.time}
                        </p>
                      </div>
                    ))}
                    {column.tasks.length === 0 && (
                      <p className="text-xs text-gray-400 px-1">
                        No tasks for this block.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-center items-center h-full text-gray-400">
              <p>Your schedule will appear here once generated.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
