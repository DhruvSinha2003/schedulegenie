"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import { Clock, MessageSquare, Mic, Trello } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const { user, error, isLoading } = useUser();

  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );

  if (error)
    return (
      <div className="p-10 text-center text-red-500">
        Error: {error.message}
      </div>
    );

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Navigation Bar */}
      <nav className="bg-white shadow-md py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <span className="text-xl font-bold text-blue-600">
                StudioGenie
              </span>
            </div>
            <div>
              {user ? (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    {user.picture && (
                      <img
                        src={user.picture}
                        alt={user.name || "User"}
                        width={32}
                        height={32}
                        className="rounded-full"
                      />
                    )}
                    <span className="text-gray-700">
                      Hi, {user.name?.split(" ")[0] || user.nickname}
                    </span>
                  </div>
                  <Link
                    href="/api/auth/logout"
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                  >
                    Logout
                  </Link>
                </div>
              ) : (
                <div className="space-x-2">
                  <Link
                    href="/api/auth/login"
                    className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center"
                  >
                    Login
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">
          Your AI-Powered Scheduling Assistant
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-10">
          StudioGenie intelligently organizes your tasks, creates time-blocked
          schedules, and helps you stay productive with AI assistance.
        </p>

        {!user && (
          <div className="mt-10">
            <Link
              href="/api/auth/login"
              className="px-8 py-3 bg-blue-600 text-white font-medium rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors text-lg"
            >
              Get Started
            </Link>
          </div>
        )}

        {user && (
          <Link
            href="/dashboard"
            className="px-8 py-3 bg-blue-600 text-white font-medium rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors text-lg"
          >
            Go to Dashboard
          </Link>
        )}
      </div>

      {/* Features Section */}
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">
              How StudioGenie Works
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Powered by AI to simplify your scheduling process
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-blue-50 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-center mb-4">
                <Mic className="h-12 w-12 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Voice-to-Text Input
              </h3>
              <p className="text-gray-600">
                Dictate your tasks naturally using the Web Speech API instead of
                typing.
              </p>
            </div>

            <div className="bg-blue-50 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-center mb-4">
                <Clock className="h-12 w-12 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                AI-Powered Scheduling
              </h3>
              <p className="text-gray-600">
                Google Gemini API intelligently organizes your tasks into time
                blocks.
              </p>
            </div>

            <div className="bg-blue-50 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-center mb-4">
                <MessageSquare className="h-12 w-12 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                AI Assistant Chat
              </h3>
              <p className="text-gray-600">
                Get help and recommendations to optimize your workflow and
                tasks.
              </p>
            </div>

            <div className="bg-blue-50 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-center mb-4">
                <Trello className="h-12 w-12 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Trello-Style Board
              </h3>
              <p className="text-gray-600">
                View and manage your tasks with an intuitive, draggable card
                interface.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              The StudioGenie Experience
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Our simple workflow helps you create the perfect schedule in
              minutes
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            <div className="text-center">
              <div className="bg-blue-100 rounded-full h-16 w-16 flex items-center justify-center mx-auto mb-4">
                <span className="text-blue-600 text-xl font-bold">1</span>
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">
                Sign In & Input Tasks
              </h3>
              <p className="text-gray-600">
                Log in with Auth0 and enter your tasks by typing or using voice
                dictation.
              </p>
            </div>

            <div className="text-center">
              <div className="bg-blue-100 rounded-full h-16 w-16 flex items-center justify-center mx-auto mb-4">
                <span className="text-blue-600 text-xl font-bold">2</span>
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">
                Set Preferences
              </h3>
              <p className="text-gray-600">
                Tell us your available hours and how flexible your schedule
                should be.
              </p>
            </div>

            <div className="text-center">
              <div className="bg-blue-100 rounded-full h-16 w-16 flex items-center justify-center mx-auto mb-4">
                <span className="text-blue-600 text-xl font-bold">3</span>
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">
                View & Edit Schedule
              </h3>
              <p className="text-gray-600">
                Get your AI-generated schedule on a clean, interactive
                Trello-style board.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-gray-300">
              © 2025 StudioGenie. All rights reserved.
            </p>
            <p className="mt-2 text-gray-400 text-sm">
              Powered by Google Gemini API and Auth0
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
