"use client"; // Need this for hooks like useUser

import { useUser } from "@auth0/nextjs-auth0/client";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  const { user, error, isLoading } = useUser();

  if (isLoading) return <div className="p-10 text-center">Loading...</div>;
  if (error)
    return (
      <div className="p-10 text-center text-red-500">
        Error: {error.message}
      </div>
    );

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-gray-100">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          StudioGenie
        </p>
        <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
          {user ? (
            <div className="flex items-center space-x-4">
              {user.picture && (
                <Image
                  src={user.picture}
                  alt={user.name || "User"}
                  className="rounded-full"
                  width={32}
                  height={32}
                />
              )}
              <span>Welcome, {user.name || user.nickname}!</span>
              <Link
                href="/api/auth/logout"
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
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
        </div>
      </div>

      <div className="relative flex place-items-center before:absolute before:h-[300px] before:w-full sm:before:w-[480px] before:-translate-x-1/2 before:rounded-full before:bg-gradient-radial before:from-white before:to-transparent before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-full sm:after:w-[240px] after:translate-x-1/3 after:bg-gradient-conic after:from-sky-200 after:via-blue-200 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-sky-900 after:dark:via-[#0141ff] after:dark:opacity-40 before:lg:h-[360px] z-[-1]">
        <h1 className="text-4xl font-bold text-center">
          Welcome to StudioGenie
        </h1>
      </div>

      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-1 lg:text-left">
        {/* We'll replace this section later with the actual app content */}
        {user ? (
          <div className="p-6 bg-white rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold mb-4">
              Your Dashboard (Coming Soon!)
            </h2>
            <p>This is where your scheduling magic will happen.</p>
            {/* Link to a protected dashboard page */}
            <Link
              href="/dashboard"
              className="mt-4 inline-block px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <p className="text-lg text-gray-700">
            Please log in to start scheduling your tasks.
          </p>
        )}
      </div>
    </main>
  );
}
