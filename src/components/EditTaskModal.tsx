// components/EditTaskModal.tsx
"use client";

import { Task } from "@/types/task";
import { useEffect, useState } from "react";
import { FaSpinner } from "react-icons/fa";

interface EditTaskModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskId: string, updates: Partial<Task>) => Promise<void>;
}

export default function EditTaskModal({
  task,
  isOpen,
  onClose,
  onSave,
}: EditTaskModalProps) {
  const [content, setContent] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update form fields when the task prop changes
  useEffect(() => {
    if (task) {
      setContent(task.content);
      setDay(task.day);
      setTime(task.time);
      setNotes(task.notes || "");
      setError(null);
      setIsSaving(false);
    }
  }, [task]);

  const handleSave = async () => {
    if (!task) return;
    setError(null);
    setIsSaving(true);

    const updates: Partial<Task> = {};
    if (content !== task.content) updates.content = content;
    if (day !== task.day) updates.day = day;
    if (time !== task.time) updates.time = time;
    const currentNotes = notes.trim() || null;
    if (currentNotes !== task.notes) updates.notes = currentNotes;

    if (Object.keys(updates).length > 0) {
      try {
        await onSave(task.taskId, updates);
        onClose();
      } catch (err: any) {
        setError(err.message || "Failed to save task.");
      } finally {
        setIsSaving(false);
      }
    } else {
      onClose();
      setIsSaving(false);
    }
  };

  if (!isOpen || !task) {
    return null;
  }

  return (
    // --- MODIFIED THIS DIV ---
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4">
      {/* Removed: bg-black bg-opacity-50 */}
      {/* Added: bg-gray-900/30 (or bg-black/20 etc.) backdrop-blur-sm */}
      {/* Added: p-4 for some padding around the modal itself on small screens */}
      {/* --- End Modification --- */}

      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-auto">
        {" "}
        {/* Added mx-auto */}
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Edit Task</h2>
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
            {error}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="edit-content"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Task Content
            </label>
            <textarea
              id="edit-content"
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
              disabled={isSaving}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edit-day"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Day / Date
              </label>
              <input
                type="text"
                id="edit-day"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                placeholder="e.g., YYYY-MM-DD or Monday"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
                disabled={isSaving}
              />
            </div>
            <div>
              <label
                htmlFor="edit-time"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Time
              </label>
              <input
                type="text"
                id="edit-time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="e.g., 9:00 AM - 10:30 AM"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
                disabled={isSaving}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="edit-notes"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Notes (Optional)
            </label>
            <textarea
              id="edit-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
              disabled={isSaving}
              placeholder="Any additional notes..."
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center justify-center"
            >
              {isSaving ? (
                <>
                  <FaSpinner className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
