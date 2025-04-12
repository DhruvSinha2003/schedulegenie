// app/chat/[taskId]/page.tsx
"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation"; // Use next/navigation for App Router
import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowLeft, FaPaperPlane, FaSpinner } from "react-icons/fa"; // Icons

// Task structure expected from get-task API
interface Task {
  taskId: string;
  content: string;
  day: string;
  time: string;
  notes: string | null;
  // Add other fields if returned and needed
}

// Chat message structure used locally and sent/received
interface ChatMessage {
  role: "user" | "model";
  text: string;
}

// Rate limit status structure
interface RateLimitStatus {
  remaining: number;
  limit: number;
  windowMinutes: number;
}

export default function ChatPage() {
  const { user, isLoading: userLoading, error: userError } = useUser();
  const params = useParams();
  const router = useRouter(); // For navigation
  const taskId = params.taskId as string; // Get taskId from URL

  const [task, setTask] = useState<Task | null>(null);
  const [taskLoading, setTaskLoading] = useState(true);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null); // Ref to scroll to bottom

  // Fetch Task Details
  useEffect(() => {
    const fetchTask = async () => {
      if (!taskId || !user) return; // Need taskId and user
      setTaskLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/get-task/${taskId}`);
        if (!response.ok) {
          const errData = await response
            .json()
            .catch(() => ({ message: "Failed to load task details." }));
          throw new Error(errData.message);
        }
        const data = await response.json();
        setTask(data.task);
        // Pre-fill user input
        if (data.task) {
          setUserInput(
            `Regarding my task "${data.task.content}" scheduled for ${data.task.day} at ${data.task.time}: `
          );
        }
      } catch (err: any) {
        setError(`Error loading task: ${err.message}`);
        setTask(null);
      } finally {
        setTaskLoading(false);
      }
    };

    if (!userLoading && user) {
      // Fetch only when user is loaded
      fetchTask();
    } else if (!userLoading && !user) {
      // If user is definitively not logged in
      setError("Please log in to use the chat feature.");
      setTaskLoading(false);
    }
  }, [taskId, user, userLoading]); // Re-run if taskId or user changes

  // Fetch Rate Limit Status
  const fetchRateLimitStatus = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/chat-status");
      if (response.ok) {
        const data = await response.json();
        setRateLimit(data);
      } else {
        console.warn("Could not fetch rate limit status:", response.status);
        setRateLimit(null); // Reset if fetch fails
      }
    } catch (err) {
      console.error("Error fetching rate limit status:", err);
      setRateLimit(null);
    }
  }, [user]); // Depend on user

  useEffect(() => {
    fetchRateLimitStatus(); // Fetch on load
  }, [fetchRateLimitStatus]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]); // Scroll whenever history changes

  // Handle Sending Message
  const handleSendMessage = async () => {
    if (!userInput.trim() || isSending || !task || !user) return;
    if (rateLimit && rateLimit.remaining <= 0) {
      setError(
        `Rate limit reached. Please wait. Limit is ${rateLimit.limit} requests per ${rateLimit.windowMinutes} minutes.`
      );
      fetchRateLimitStatus(); // Re-check status
      return;
    }

    const newUserMessage: ChatMessage = {
      role: "user",
      text: userInput.trim(),
    };
    const currentHistory = [...chatHistory, newUserMessage];

    setChatHistory(currentHistory);
    setUserInput(""); // Clear input field immediately
    setIsSending(true);
    setError(null);

    try {
      // Prepare history in the format expected by the backend API
      const apiHistory = currentHistory.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: apiHistory,
          taskContext: `Task: ${task.content} (${task.day} ${task.time})`, // Send task context
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        // Check if rate limit was exceeded specifically
        if (response.status === 429 && result.limitExceeded) {
          setError(result.message || "Rate limit exceeded.");
        } else {
          throw new Error(result.message || "Failed to get response from AI.");
        }
        setChatHistory((prev) => prev.slice(0, -1)); // Remove user message if request failed
      } else {
        const aiResponseMessage: ChatMessage = {
          role: "model",
          text: result.response,
        };
        setChatHistory((prev) => [...prev, aiResponseMessage]); // Add AI response
        fetchRateLimitStatus(); // Update rate limit status after successful call
      }
    } catch (err: any) {
      setError(`Error communicating with AI: ${err.message}`);
      // Optionally remove the user's message from history on error
      setChatHistory((prev) => prev.slice(0, -1));
    } finally {
      setIsSending(false);
    }
  };

  // --- Render Logic ---
  if (userLoading || taskLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <FaSpinner className="animate-spin text-4xl text-blue-500" />
      </div>
    );
  }

  if (userError) {
    return (
      <div className="p-6 text-center text-red-500">
        Auth Error: {userError.message}
      </div>
    );
  }
  if (!user) {
    // Should ideally be handled by page protection, but added for safety
    return (
      <div className="p-6 text-center text-red-500">
        Please{" "}
        <a href="/api/auth/login" className="underline text-blue-600">
          log in
        </a>{" "}
        to access the chat.
      </div>
    );
  }

  if (!task && !taskLoading) {
    // Task fetch finished but no task found
    return (
      <div className="p-6 text-center">
        <p className="text-red-500 mb-4">
          {error || "Task not found or you do not have permission to view it."}
        </p>
        <Link href="/dashboard" className="text-blue-600 hover:underline">
          Go back to Dashboard
        </Link>
      </div>
    );
  }

  // Main chat UI
  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow p-4 flex items-center space-x-4 sticky top-0 z-10">
        <Link
          href="/dashboard"
          className="text-gray-600 hover:text-gray-900"
          title="Back to Dashboard"
        >
          <FaArrowLeft size={20} />
        </Link>
        {task && (
          <div>
            <h1 className="text-lg font-semibold text-gray-800">
              AI Assistant for Task:
            </h1>
            <p className="text-sm text-indigo-600">
              {task.content} ({task.day} {task.time})
            </p>
          </div>
        )}
        {/* Display Rate Limit */}
        {rateLimit !== null && (
          <div className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
            Requests Remaining: {rateLimit.remaining}/{rateLimit.limit} (in{" "}
            {rateLimit.windowMinutes} min window)
          </div>
        )}
      </header>

      {/* Error Display */}
      {error && (
        <div
          className="p-4 m-4 bg-red-100 border border-red-400 text-red-700 rounded text-sm sticky top-[73px] z-10"
          role="alert"
        >
          {" "}
          {/* Adjust top value based on header height */}
          <strong className="font-bold">Error:</strong> {error}
        </div>
      )}

      {/* Chat History */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4">
        {chatHistory.map((msg, index) => (
          <div
            key={index}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-lg lg:max-w-xl px-4 py-2 rounded-lg shadow ${
                msg.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-white text-gray-800"
              }`}
            >
              {/* Basic Markdown support could be added here later */}
              <p className="whitespace-pre-wrap">{msg.text}</p>{" "}
              {/* Preserve line breaks */}
            </div>
          </div>
        ))}
        {/* Dummy div to ensure scrolling to bottom */}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white p-4 border-t border-gray-200 sticky bottom-0">
        <div className="flex items-center space-x-3">
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Ask the AI for help with your task..."
            className="flex-grow p-2 border border-gray-300 rounded-md resize-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            rows={2} // Start with 2 rows, can adjust
            disabled={
              isSending || (rateLimit !== null && rateLimit.remaining <= 0)
            } // Disable if sending or limit reached
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault(); // Prevent newline on Enter
                handleSendMessage();
              }
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={
              isSending ||
              !userInput.trim() ||
              (rateLimit !== null && rateLimit.remaining <= 0)
            }
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            style={{ minWidth: "80px" }} // Prevent button width change
          >
            {isSending ? (
              <FaSpinner className="animate-spin" />
            ) : (
              <FaPaperPlane />
            )}
          </button>
        </div>
        {rateLimit && rateLimit.remaining <= 0 && (
          <p className="text-xs text-red-500 mt-1 text-center">
            Rate limit reached. Please wait.
          </p>
        )}
      </div>
    </div>
  );
}
