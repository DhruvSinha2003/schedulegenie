// app/chat/[taskId]/page.tsx
"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation"; // Use next/navigation
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaInfoCircle,
  FaPaperPlane,
  FaSpinner,
} from "react-icons/fa";
import ReactMarkdown from "react-markdown";

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
  resetTime?: string;
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
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 150)}px`;
    }
  };

  // Calculate estimated reset time
  const calculateResetTime = useCallback(
    (windowMinutes: number | undefined) => {
      if (typeof windowMinutes !== "number") return null;
      const now = new Date();
      const resetTime = new Date(now.getTime() + windowMinutes * 60000);
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
          throw new Error(errData.message);
        }
        const data = await response.json();
        setTask(data.task);
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
      fetchTask();
    } else if (!userLoading && !user) {
      setError("Please log in to use the chat feature.");
      setTaskLoading(false);
    }
  }, [taskId, user, userLoading]);

  // Fetch Rate Limit Status Function
  const fetchRateLimitStatus = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/chat-status");
      if (response.ok) {
        const data: RateLimitStatus = await response.json();
        data.resetTime = calculateResetTime(data.windowMinutes);
        setRateLimit(data);
      } else {
        console.warn("Could not fetch rate limit status:", response.status);
        setRateLimit(null);
      }
    } catch (err) {
      console.error("Error fetching rate limit status:", err);
      setRateLimit(null);
    }
  }, [user, calculateResetTime]);

  // Effect for Initial Fetch and Interval for Rate Limit
  useEffect(() => {
    if (user) {
      fetchRateLimitStatus();
    } // Initial fetch

    const intervalId = setInterval(() => {
      if (user) {
        fetchRateLimitStatus();
      } // Periodic fetch
    }, 60000); // Refresh every minute

    return () => clearInterval(intervalId); // Cleanup interval
    // Depend only on user and the stable fetch function reference
  }, [user]);

  // Textarea Resize Effect
  useEffect(() => {
    autoResizeTextarea();
  }, [userInput]);

  // Scroll to Bottom Effect
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Handle Sending Message Function
  const handleSendMessage = async () => {
    if (!userInput.trim() || isSending || !task || !user) return;
    if (rateLimit && rateLimit.remaining <= 0) {
      setError(
        `Rate limit reached. Please wait until ${
          rateLimit.resetTime || "the limit resets"
        }. Limit is ${rateLimit.limit} requests per ${
          rateLimit.windowMinutes
        } minutes.`
      );
      fetchRateLimitStatus();
      return;
    }

    const newUserMessage: ChatMessage = {
      role: "user",
      text: userInput.trim(),
    };
    const currentHistory = [...chatHistory, newUserMessage];

    setChatHistory(currentHistory);
    setUserInput("");
    setIsSending(true);
    setError(null);

    try {
      const apiHistory = currentHistory.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      }));
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: apiHistory,
          taskContext: `Task: ${task.content} (${task.day} ${task.time})`,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 429 && result.limitExceeded) {
          setError(result.message || "Rate limit exceeded.");
          fetchRateLimitStatus();
        } else {
          throw new Error(result.message || "Failed to get response from AI.");
        }
        if (!(response.status === 429 && result.limitExceeded)) {
          setChatHistory((prev) => prev.slice(0, -1)); // Remove user msg on general error
        }
      } else {
        const aiResponseMessage: ChatMessage = {
          role: "model",
          text: result.response,
        };
        setChatHistory((prev) => [...prev, aiResponseMessage]);
        fetchRateLimitStatus(); // Update status after successful request
      }
    } catch (err: any) {
      setError(`Error communicating with AI: ${err.message}`);
      setChatHistory((prev) => prev.slice(0, -1)); // Remove user msg on error
    } finally {
      setIsSending(false);
      textareaRef.current?.focus(); // Refocus textarea
    }
  };

  // --- Render Logic ---
  if (userLoading || taskLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="bg-white p-8 rounded-lg shadow-md flex flex-col items-center">
          <FaSpinner className="animate-spin text-4xl text-indigo-600 mb-4" />
          <p className="text-gray-600">Loading your chat session...</p>
        </div>
      </div>
    );
  }

  if (userError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex justify-center items-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <div className="p-6 text-center text-red-500">
            <h2 className="text-xl font-semibold mb-4">Authentication Error</h2>
            <p>{userError.message}</p>
            <Link
              href="/api/auth/login"
              className="mt-4 inline-block bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition"
            >
              Try Logging In Again
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex justify-center items-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <div className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Access Required</h2>
            <p className="text-gray-700 mb-4">
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
      </div>
    );
  }

  if (!task && !taskLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex justify-center items-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <div className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Task Not Found</h2>
            <p className="text-red-500 mb-6">
              {error ||
                "Task not found or you do not have permission to view it."}
            </p>
            <Link
              href="/dashboard"
              className="inline-block bg-indigo-600 text-white px-5 py-2 rounded-md hover:bg-indigo-700 transition-colors"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Main chat UI
  return (
    <div className="flex flex-col h-screen bg-gradient-to-r from-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white shadow-md px-6 py-4 flex items-center sticky top-0 z-10 border-b border-gray-200">
        <Link
          href="/dashboard"
          className="text-gray-600 hover:text-indigo-700 transition-colors p-2 rounded-full hover:bg-indigo-50 -ml-2"
          title="Back to Dashboard"
        >
          <FaArrowLeft size={20} />
        </Link>
        {task && (
          <div className="ml-4 flex-grow min-w-0">
            <h1 className="text-lg font-semibold text-gray-800 truncate">
              AI Assistant
            </h1>
            <p className="text-sm text-indigo-700 font-medium truncate">
              Task: {task.content} • {task.day} at {task.time}
            </p>
          </div>
        )}
        {rateLimit !== null && (
          <div className="ml-auto flex-shrink-0 flex flex-col items-end">
            <div className="flex items-center gap-2 bg-gradient-to-r from-blue-100 to-indigo-100 text-indigo-800 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium">
              <span className="whitespace-nowrap">
                {rateLimit.remaining}/{rateLimit.limit} requests
              </span>
              <div className="relative group">
                <FaInfoCircle className="text-indigo-500 cursor-help" />
                <div className="absolute right-0 w-64 p-3 mt-2 bg-white rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 text-xs text-gray-700 border border-gray-200">
                  <p>
                    Limit: {rateLimit.limit} chat requests per{" "}
                    {rateLimit.windowMinutes} minutes.
                  </p>
                  {rateLimit.resetTime && (
                    <p className="mt-1 font-medium">
                      Next window reset: ~{rateLimit.resetTime}
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
        <div
          className="p-4 mx-6 mt-4 bg-red-100 border border-red-400 text-red-700 rounded-md shadow-sm text-sm sticky top-[73px] z-10 flex items-center"
          role="alert"
        >
          <div className="mr-2 text-red-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <strong className="font-medium">Error:</strong> {error}
          </div>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
            aria-label="Dismiss error"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Chat History */}
      <div className="flex-grow overflow-y-auto p-6 space-y-6">
        {chatHistory.length === 0 && !isSending && (
          <div className="flex justify-center items-center h-full">
            <div className="text-center text-gray-500 max-w-md">
              <h3 className="text-xl font-medium mb-2">
                Start the conversation
              </h3>
              <p>
                Ask the AI assistant about your task, or for ideas, suggestions,
                or help with planning.
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
              className={`max-w-lg lg:max-w-xl px-5 py-3 rounded-2xl shadow-sm ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-800 border border-gray-200"
              }`}
            >
              {msg.role === "model" ? (
                <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.text}</p>
              )}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-800 px-4 py-3 rounded-2xl shadow-sm border border-gray-200 ml-4">
              <div className="flex space-x-2">
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
                <div
                  className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white p-5 border-t border-gray-200 sticky bottom-0 shadow-[0_-2px_5px_-1px_rgba(0,0,0,0.05)]">
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
                    : "Ask the AI for help..."
                }
                className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed transition-all"
                style={{ minHeight: "48px", maxHeight: "150px" }}
                disabled={
                  isSending || (rateLimit !== null && rateLimit.remaining <= 0)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={1}
              />
              {rateLimit && rateLimit.remaining <= 0 && (
                <p className="text-xs text-red-500 mt-1 mb-0">
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
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors self-start"
              style={{ height: "48px" }}
              title="Send message"
            >
              {isSending ? (
                <FaSpinner className="animate-spin" />
              ) : (
                <FaPaperPlane />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
