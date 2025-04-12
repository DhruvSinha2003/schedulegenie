// app/dashboard/page.tsx
"use client";

import TaskInputForm from "@/components/TaskInputForm";
import TaskCard from "@/components/TaskCard";
import EditTaskModal from "@/components/EditTaskModal";
import { useUser } from "@auth0/nextjs-auth0/client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FaFileDownload, FaSpinner } from "react-icons/fa"; // Added FaFileDownload
import { Task } from "@/types/task";

// --- Interfaces ---
interface ScheduleColumn {
    id: string; // Unique key for the column (e.g., '2025-04-12' or 'monday')
    title: string; // Display title (e.g., 'Saturday, 2025-04-12')
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
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scheduleNotes, setScheduleNotes] = useState<string | null>(null);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [pendingTaskActions, setPendingTaskActions] = useState<Record<string, 'toggle' | 'delete' | 'edit'>>({});
    const [formKey, setFormKey] = useState<number>(0);

    const notesTimerRef = useRef<NodeJS.Timeout | null>(null);
    const hasFetchedRef = useRef(false);

    const dayOrder: { [key: string]: number } = useMemo(() => ({
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    }), []);

    // --- Calculate schedule columns with enhanced titles ---
    const scheduleColumns = useMemo(() => {
        if (!allTasks || allTasks.length === 0) return [];

        const columnsMap: { [key: string]: ScheduleColumn } = {};

        // Sort tasks robustly first
        const sortedTasks = [...allTasks].sort((a, b) => {
            const dateA = new Date(a.day);
            const dateB = new Date(b.day);
             // Check if it's a valid date and not just a number/year
            const isValidDateA = !isNaN(dateA.getTime()) && !/^\d+$/.test(a.day.trim());
            const isValidDateB = !isNaN(dateB.getTime()) && !/^\d+$/.test(b.day.trim());
            const dayNumA = dayOrder[a.day?.toLowerCase()] ?? 7;
            const dayNumB = dayOrder[b.day?.toLowerCase()] ?? 7;

            if (isValidDateA && isValidDateB) {
                if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
            } else if (isValidDateA) return -1;
            else if (isValidDateB) return 1;
            else if (dayNumA !== dayNumB) return dayNumA - dayNumB;
            return (a.time || "").localeCompare(b.time || "");
        });

        // Group tasks and create display titles
        sortedTasks.forEach((task) => {
            const originalDay = task.day || "Unspecified Day";
            let groupingKey = originalDay.toLowerCase(); // Default grouping key (lowercase)
            let displayTitle = originalDay; // Default display title
            let columnId = originalDay.toLowerCase().replace(/[^a-z0-9-]/g, ""); // Default ID (safe characters)

            try {
                const date = new Date(originalDay);
                 // Check if it's a valid date AND not just a year/number
                 if (!isNaN(date.getTime()) && !/^\d+$/.test(originalDay.trim())) {
                    // It's a valid date like YYYY-MM-DD
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }); // e.g., "Saturday"
                    displayTitle = `${dayName}, ${originalDay}`; // Combine: "Saturday, 2025-04-12"
                    groupingKey = originalDay; // Keep grouping by the *exact* date string for uniqueness
                    columnId = originalDay; // Use the exact date string as ID for stability
                 } else if (dayOrder.hasOwnProperty(originalDay.toLowerCase())) {
                     // It's likely a day name like "Monday"
                     const lowerDay = originalDay.toLowerCase();
                     // Capitalize for display
                     displayTitle = lowerDay.charAt(0).toUpperCase() + lowerDay.slice(1);
                     groupingKey = lowerDay; // Group by lowercase day name
                     columnId = lowerDay; // Use lowercase day name as ID
                 }
                 // else: keep originalDay as title and ID for unspecified/unparseable days
            } catch (e) { /* Ignore parsing errors, use defaults */ }

            // Use the derived columnId for mapping
            if (!columnsMap[columnId]) {
                columnsMap[columnId] = { id: columnId, title: displayTitle, tasks: [] };
            }
            columnsMap[columnId].tasks.push(task);
        });

        // Order columns based on the first task's appearance in the fully sorted list
        const orderedColumns = Object.values(columnsMap).sort((colA, colB) => {
            // Find the index in sortedTasks based on the column's ID
            const firstTaskAIndex = sortedTasks.findIndex(task => {
                const originalDay = task.day || "Unspecified Day";
                const date = new Date(originalDay);
                // Recalculate the potential ID for comparison
                const taskId = (!isNaN(date.getTime()) && !/^\d+$/.test(originalDay.trim()))
                    ? originalDay // Date string ID
                    : originalDay.toLowerCase(); // Lowercase day name ID or original if unparseable
                return taskId === colA.id;
            });
             const firstTaskBIndex = sortedTasks.findIndex(task => {
                const originalDay = task.day || "Unspecified Day";
                const date = new Date(originalDay);
                const taskId = (!isNaN(date.getTime()) && !/^\d+$/.test(originalDay.trim()))
                    ? originalDay
                    : originalDay.toLowerCase();
                return taskId === colB.id;
            });

            return (firstTaskAIndex === -1 ? Infinity : firstTaskAIndex) - (firstTaskBIndex === -1 ? Infinity : firstTaskBIndex);
        });

        return orderedColumns;
    }, [allTasks, dayOrder]); // Include dayOrder

    // Effect to auto-hide schedule notes
    useEffect(() => {
        if (notesTimerRef.current) { clearTimeout(notesTimerRef.current); notesTimerRef.current = null; }
        if (scheduleNotes) {
            notesTimerRef.current = setTimeout(() => { setScheduleNotes(null); notesTimerRef.current = null; }, 5000);
        }
        return () => { if (notesTimerRef.current) { clearTimeout(notesTimerRef.current); } };
    }, [scheduleNotes]);

    // Fetch schedule
    useEffect(() => {
         const fetchSchedule = async () => {
            if (hasFetchedRef.current || !user) return;
            hasFetchedRef.current = true;
            setIsLoadingSchedule(true);
            setError(null);
            setPendingTaskActions({});
            try {
                const response = await fetch("/api/get-schedule");
                if (!response.ok) { throw new Error((await response.json().catch(()=>({}))).message || "Failed to load schedule"); }
                const result: ScheduleApiResponse = await response.json();
                setAllTasks(result.tasks || []);
            } catch (err: any) {
                setError("Could not load saved schedule: " + err.message);
                setAllTasks([]);
                setScheduleNotes(null);
            } finally {
                setIsLoadingSchedule(false);
            }
        };
        if (!userLoading) {
            if (user) { fetchSchedule(); }
            else { /* Reset state on logout */
                hasFetchedRef.current = false; setAllTasks([]); setScheduleNotes(null); setError(null); setIsLoadingSchedule(false); setPendingTaskActions({}); setIsEditModalOpen(false); setEditingTask(null); setFormKey(0);
            }
        }
    }, [user, userLoading]);

    // Handler for generating a schedule
    const handleGenerateSchedule = async (data: ScheduleInputData) => {
         if (!user) return;
        setIsGenerating(true); setError(null); setScheduleNotes(null); setPendingTaskActions({});
        try {
            const response = await fetch("/api/generate-schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), });
            if (!response.ok) { throw new Error((await response.json().catch(()=>({}))).message || "Failed to generate schedule"); }
            const result: ScheduleApiResponse = await response.json();
            setAllTasks(result.tasks || []);
            setScheduleNotes(result.notes || null);
            setFormKey(prevKey => prevKey + 1); // Reset form
        } catch (err: any) {
            setError("Generate schedule error: " + err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    // Handler for toggling task completion
    const handleToggleComplete = async (taskId: string, currentStatus: boolean) => {
         if (!user) return; setError(null); setPendingTaskActions(prev => ({ ...prev, [taskId]: 'toggle' }));
        try {
            const newStatus = !currentStatus;
            const response = await fetch(`/api/update-task`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: taskId, isCompleted: newStatus }), });
            if (!response.ok) { throw new Error((await response.json().catch(()=>({}))).message || "Server error updating task status."); }
            setAllTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, isCompleted: newStatus } : t));
        } catch (err: any) { setError("Update task error: " + err.message); }
        finally { setPendingTaskActions(prev => { const n = {...prev}; delete n[taskId]; return n; }); }
    };

    // Handler for deleting a task
    const handleDeleteTask = async (taskId: string) => {
         if (!user) return; const taskToDelete = allTasks.find(t => t.taskId === taskId); if (!taskToDelete) return; if (!window.confirm(`Delete task: "${taskToDelete.content}"?`)) return; setError(null); setPendingTaskActions(prev => ({ ...prev, [taskId]: 'delete' }));
        try {
            const response = await fetch(`/api/delete-task?taskId=${encodeURIComponent(taskId)}`, { method: "DELETE", });
            if (!response.ok) { throw new Error((await response.json().catch(()=>({}))).message || "Server error deleting task."); }
            setAllTasks(prev => prev.filter(t => t.taskId !== taskId));
        } catch (err: any) { setError("Delete task error: " + err.message); }
        finally { setPendingTaskActions(prev => { const n = {...prev}; delete n[taskId]; return n; }); }
    };

    // Handlers for Edit Modal
    const handleOpenEditModal = (task: Task) => { setEditingTask(task); setIsEditModalOpen(true); };
    const handleCloseEditModal = () => { setIsEditModalOpen(false); setEditingTask(null); };
    const handleSaveTask = async (taskId: string, updates: Partial<Task>) => {
         if (!user || !editingTask) return; setError(null); setPendingTaskActions(prev => ({ ...prev, [taskId]: 'edit' }));
        try {
            const response = await fetch(`/api/edit-task`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: taskId, updates: updates }), });
            if (!response.ok) { throw new Error((await response.json().catch(()=>({}))).message || "Server error saving task changes."); }
            setAllTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, ...updates } : t));
            handleCloseEditModal();
        } catch (err: any) { console.error("Save task error:", err); throw err; }
        finally { setPendingTaskActions(prev => { const n = {...prev}; delete n[taskId]; return n; }); }
    };


    // --- Render Logic ---

    if (userLoading) {
        return <div className="flex justify-center items-center min-h-screen"><FaSpinner className="animate-spin text-3xl text-indigo-500 mr-3" /><span className="text-gray-700">Loading user...</span></div>;
    }
    if (userError) {
        return <div className="p-10 text-center text-red-500">Auth Error: {userError.message}</div>;
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
                            />)}
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
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded" role="alert">
                    <strong className="font-bold">Error:</strong>
                    <span className="block sm:inline ml-2">{error}</span>
                </div>
            )}

            {/* Temp Display Overall Schedule Notes */}
            {scheduleNotes && (
                <div className="mb-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded text-sm transition-opacity duration-500" role="alert">
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
                            key={formKey} // Use key to force reset
                            onSubmit={handleGenerateSchedule}
                            isGenerating={isGenerating}
                        />
                    ) : (
                        <p className="text-gray-500">Please log in to create a schedule.</p>
                    )}
                </div>

                {/* Column 2: Schedule Board */}
                <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-lg min-h-[60vh]">
                     {/* Modified Header with Export Button */}
                     <div className="flex justify-between items-center border-b pb-2 mb-4">
                         <h2 className="text-xl font-semibold text-gray-700">
                             Your Schedule
                         </h2>
                         {/* Export Button - Only show if user is logged in and has tasks */}
                         {user && allTasks.length > 0 && !isLoadingSchedule && (
                             <a
                                 href="/api/export-schedule" // Link directly to the API route
                                 download="schedule.ics" // Suggest filename (browser might override)
                                 className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                                 title="Export schedule as .ics file"
                             >
                                 <FaFileDownload className="-ml-0.5 mr-2 h-4 w-4" aria-hidden="true" />
                                 Export (.ics)
                             </a>
                         )}
                    </div>
                    {/* End Modified Header */}

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
                            <p className="ml-4 text-lg text-gray-600">Generating schedule...</p>
                        </div>
                    )}

                    {/* Schedule Display or Placeholder */}
                    {!isLoadingSchedule && !isGenerating && scheduleColumns.length > 0 && (
                        <div className="flex space-x-4 overflow-x-auto pb-4">
                            {scheduleColumns.map((column) => (
                                <div
                                    key={column.id} // Use the consistent ID (date or lowercase day name)
                                    className="bg-gray-100 rounded-lg p-3 min-w-[280px] max-w-[320px] flex-shrink-0 self-start"
                                >
                                    {/* Use the enhanced display title */}
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
                    {!isLoadingSchedule && !isGenerating && scheduleColumns.length === 0 && (
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