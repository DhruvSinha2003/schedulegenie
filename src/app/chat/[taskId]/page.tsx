// app/chat/[taskId]/page.tsx
"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaInfoCircle,
  FaPaperPlane,
  FaSpinner,
  FaTimes, // For closing error
} from "react-icons/fa";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // For markdown tables, etc.

// Interfaces
interface Task {
  taskId: string;
  content: string;
  day: string;
  time: string;
  notes: string | null;
}

interface ChatMessage {
  role: "user" | "model";
  text: string;
}

interface RateLimitStatus {
  remaining: number;
  limit: number;
  windowMinutes: number;
  resetTime?: string; // Optional calculated reset time string
}

export default function ChatPage() {
  const { user, isLoading: userLoading, error: userError } = useUser();
  const params = useParams();
  const router = useRouter();
  const taskId = params.taskId as string;

  const [task, setTask] = useState<Task | null>(null);
  const [taskLoading, setTaskLoading] = useState(true);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"; // Reset height
      const scrollHeight = textareaRef.current.scrollHeight;
      // Set height based on scroll height, capped at a max height (e.g., 150px)
      textareaRef.current.style.height = `${Math.min(scrollHeight, 150)}px`;
    }
  };

  // Calculate estimated reset time
  const calculateResetTime = useCallback(
    (windowMinutes: number | undefined): string | null => {
      if (typeof windowMinutes !== "number" || windowMinutes <= 0) return null;
      const now = new Date();
      // Estimate reset time based on the window length from *now*
      // Note: This is an estimate, the actual server window might have started earlier.
      const resetTime = new Date(now.getTime() + windowMinutes * 60 * 1000);
      return resetTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    []
  );

  // Fetch Task Details Effect
  useEffect(() => {
    const fetchTask = async () => {
      if (!taskId || !user) return;
      setTaskLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/get-task/${taskId}`);
        if (!response.ok) {
          const errData = await response
            .json()
            .catch(() => ({ message: "Failed to load task details." }));
          throw new Error(
            errData.message || `HTTP error! status: ${response.status}`
          );
        }
        const data = await response.json();
        if (!data.task) {
          throw new Error("Task data not found in response.");
        }
        setTask(data.task);
        // Pre-fill input with task context only if chat history is empty
        if (chatHistory.length === 0) {
          setUserInput(
            `Regarding my task "${data.task.content}" scheduled for ${data.task.day} at ${data.task.time}: `
          );
        }
      } catch (err: any) {
        setError(`Error loading task: ${err.message}`);
        setTask(null); // Ensure task is null on error
      } finally {
        setTaskLoading(false);
      }
    };

    if (!userLoading && user) {
      fetchTask();
    } else if (!userLoading && !user) {
      setError("Please log in to use the chat feature.");
      setTaskLoading(false);
    }
    // Intentionally excluding chatHistory from dependencies to avoid re-fetching task on message send
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, user, userLoading]);

  // Fetch Rate Limit Status Function
  const fetchRateLimitStatus = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/chat-status");
      if (response.ok) {
        const data: RateLimitStatus = await response.json();
        // Calculate reset time locally for display purposes
        data.resetTime = calculateResetTime(data.windowMinutes);
        setRateLimit(data);
        // If limit was reached and now it's not, clear the error
        if (error?.includes("Rate limit reached") && data.remaining > 0) {
          setError(null);
        }
      } else {
        // Handle non-ok responses if needed, e.g., log or show generic error
        setRateLimit(null); // Reset or keep previous state? Resetting might be safer.
      }
    } catch (err) {
      // Network error, etc.
      setRateLimit(null);
    }
  }, [user, calculateResetTime, error]); // Include error dependency to clear rate limit error

  // Effect for Initial Fetch and Interval for Rate Limit
  useEffect(() => {
    if (user) {
      fetchRateLimitStatus(); // Initial fetch
    }

    const intervalId = setInterval(() => {
      if (user) {
        fetchRateLimitStatus(); // Periodic fetch
      }
    }, 60000); // Refresh every minute

    return () => clearInterval(intervalId); // Cleanup interval
  }, [user, fetchRateLimitStatus]); // Depend on user and the stable fetch function reference

  // Textarea Resize Effect
  useEffect(() => {
    autoResizeTextarea();
  }, [userInput]);

  // Scroll to Bottom Effect
  useEffect(() => {
    // Scroll down smoothly, maybe slightly delayed to allow rendering
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, [chatHistory]);

  // Handle Sending Message Function
  const handleSendMessage = async () => {
    const trimmedInput = userInput.trim();
    if (!trimmedInput || isSending || !task || !user) return;

    // Check rate limit before sending
    if (rateLimit && rateLimit.remaining <= 0) {
      setError(
        `Rate limit reached. Please wait until ${
          rateLimit.resetTime || "later"
        }. Limit: ${rateLimit.limit}/${rateLimit.windowMinutes} min.`
      );
      fetchRateLimitStatus(); // Re-fetch status immediately
      return;
    }

    const newUserMessage: ChatMessage = { role: "user", text: trimmedInput };
    const currentHistory = [...chatHistory, newUserMessage];

    setChatHistory(currentHistory); // Optimistic UI update for user message
    setUserInput(""); // Clear input immediately
    setIsSending(true);
    setError(null); // Clear previous errors

    try {
      // Format history for the API
      const apiHistory = currentHistory.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: apiHistory,
          // Optionally add task context if needed, but history should suffice
          // taskContext: `Task: ${task.content} (${task.day} ${task.time})`,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        // Specific handling for rate limit error
        if (response.status === 429 && result.limitExceeded) {
          setError(
            result.message || "Rate limit exceeded. Please try again later."
          );
          fetchRateLimitStatus(); // Update rate limit state immediately
        } else {
          // General error
          throw new Error(
            result.message || `Request failed with status ${response.status}`
          );
        }
        // Don't remove user message for rate limit error, only for other errors
        if (!(response.status === 429 && result.limitExceeded)) {
          // Revert optimistic user message on general error
          setChatHistory((prev) => prev.slice(0, -1));
        }
      } else {
        // Success
        const aiResponseMessage: ChatMessage = {
          role: "model",
          text: result.response,
        };
        setChatHistory((prev) => [...prev, aiResponseMessage]);
        fetchRateLimitStatus(); // Update status after successful request
      }
    } catch (err: any) {
      setError(`Error communicating with AI: ${err.message}`);
      // Revert optimistic user message on network or unexpected errors
      setChatHistory((prev) => prev.slice(0, -1));
    } finally {
      setIsSending(false);
      // Ensure textarea gets focus after sending/error
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  // --- Render Logic ---
  if (userLoading || taskLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="bg-white p-8 rounded-lg shadow-md flex flex-col items-center">
          <FaSpinner className="animate-spin text-4xl text-indigo-600 mb-4" />
          <p className="text-gray-600">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (userError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex justify-center items-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
          <h2 className="text-xl font-semibold mb-4 text-red-600">
            Authentication Error
          </h2>
          <p className="text-gray-700 mb-6">{userError.message}</p>
          <a
            href="/api/auth/login"
            className="inline-block bg-indigo-600 text-white px-5 py-2 rounded-md hover:bg-indigo-700 transition-colors"
          >
            Log In Again
          </a>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex justify-center items-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
          <h2 className="text-xl font-semibold mb-4">Access Required</h2>
          <p className="text-gray-700 mb-6">
            Please log in to access the AI chat assistant.
          </p>
          <a
            href="/api/auth/login"
            className="inline-block bg-indigo-600 text-white px-5 py-2 rounded-md hover:bg-indigo-700 transition-colors"
          >
            Log In
          </a>
        </div>
      </div>
    );
  }

  if (!task && !taskLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex justify-center items-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
          <h2 className="text-xl font-semibold mb-4 text-red-600">
            Task Not Found
          </h2>
          <p className="text-gray-700 mb-6">
            {error ||
              "The requested task could not be found or you don't have permission."}
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-indigo-600 text-white px-5 py-2 rounded-md hover:bg-indigo-700 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Main chat UI
  return (
    <div className="flex flex-col h-screen bg-gradient-to-r from-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white shadow-md px-4 sm:px-6 py-3 flex items-center sticky top-0 z-20 border-b border-gray-200">
        <Link
          href="/dashboard"
          className="text-gray-600 hover:text-indigo-700 transition-colors p-2 rounded-full hover:bg-indigo-50 -ml-2 mr-2"
          title="Back to Dashboard"
        >
          <FaArrowLeft size={20} />
        </Link>
        {task && (
          <div className="flex-grow min-w-0">
            {" "}
            {/* Prevent text overflow */}
            <h1 className="text-lg font-semibold text-gray-800 truncate">
              AI Assistant
            </h1>
            <p
              className="text-sm text-indigo-700 font-medium truncate"
              title={`${task.content} • ${task.day} at ${task.time}`}
            >
              Task: {task.content} • {task.day} at {task.time}
            </p>
          </div>
        )}
        {rateLimit !== null && (
          <div className="ml-auto flex-shrink-0 flex flex-col items-end">
            <div className="flex items-center gap-2 bg-gradient-to-r from-blue-100 to-indigo-100 text-indigo-800 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium">
              <span className="whitespace-nowrap">
                {rateLimit.remaining}/{rateLimit.limit} left
              </span>
              <div className="relative group">
                <FaInfoCircle className="text-indigo-500 cursor-help" />
                <div className="absolute right-0 w-60 p-3 mt-2 bg-white rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 text-xs text-gray-700 border border-gray-200">
                  <p>
                    Limit: {rateLimit.limit} messages per{" "}
                    {rateLimit.windowMinutes} minutes.
                  </p>
                  {rateLimit.resetTime && (
                    <p className="mt-1 font-medium">
                      Next reset estimate: ~{rateLimit.resetTime}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Error Display */}
      {error && (
        <div className="sticky top-[65px] z-10 p-0 mx-4 sm:mx-6 mt-3">
          {" "}
          {/* Adjust top based on header height */}
          <div
            className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md shadow-sm text-sm flex items-center justify-between"
            role="alert"
          >
            <div className="flex items-center">
              {/* Optional: Icon */}
              <svg
                className="h-5 w-5 text-red-500 mr-2"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1 8a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="flex-1 break-words">
                <strong className="font-medium">Error:</strong> {error}
              </span>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-3 text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-200"
              aria-label="Dismiss error"
            >
              <FaTimes size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Chat History - Added padding px-4 sm:px-6 */}
      <div className="flex-grow overflow-y-auto py-6 px-4 sm:px-6 space-y-4">
        {chatHistory.length === 0 && !isSending && (
          <div className="flex justify-center items-center h-full">
            <div className="text-center text-gray-500 max-w-md">
              <h3 className="text-xl font-medium mb-2">
                Start the conversation
              </h3>
              <p>
                Ask the AI assistant anything about your task: "{task?.content}
                ".
              </p>
            </div>
          </div>
        )}
        {chatHistory.map((msg, index) => (
          <div
            key={index}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-lg lg:max-w-xl px-4 py-2 rounded-xl shadow-sm ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-800 border border-gray-200"
              }`}
            >
              {msg.role === "model" ? (
                // Added break-words and overflow-x-hidden here for safety
                <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 break-words overflow-x-hidden">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.text}
                  </ReactMarkdown>
                </div>
              ) : (
                // Added break-words here
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
              )}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-800 px-4 py-3 rounded-xl shadow-sm border border-gray-200">
              {/* Simple loading dots */}
              <div className="flex space-x-1.5">
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
                <div
                  className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                ></div>
                <div
                  className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} className="h-1" /> {/* Anchor for scrolling */}
      </div>

      {/* Input Area */}
      <div className="bg-white p-4 border-t border-gray-200 sticky bottom-0 shadow-[0_-2px_5px_-1px_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start space-x-3">
            <div className="flex-grow flex flex-col">
              <textarea
                ref={textareaRef}
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={
                  rateLimit?.remaining === 0
                    ? "Rate limit reached..."
                    : "Ask the AI..."
                }
                className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
                style={{
                  minHeight: "48px",
                  maxHeight: "150px",
                  overflowY: "auto",
                }} // Ensure scroll appears if needed
                disabled={
                  isSending || (rateLimit !== null && rateLimit.remaining <= 0)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={1} // Start with 1 row, auto-resize will handle expansion
              />
              {rateLimit && rateLimit.remaining <= 0 && (
                <p className="text-xs text-red-500 mt-1 mb-0 px-1">
                  Rate limit reached. Wait until ~{rateLimit.resetTime}.
                </p>
              )}
            </div>
            <button
              onClick={handleSendMessage}
              disabled={
                isSending ||
                !userInput.trim() ||
                (rateLimit !== null && rateLimit.remaining <= 0)
              }
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors self-start"
              style={{ height: "48px", width: "48px" }} // Fixed size for button
              title="Send message"
            >
              {isSending ? (
                <FaSpinner className="animate-spin text-lg" />
              ) : (
                <FaPaperPlane className="text-lg" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
