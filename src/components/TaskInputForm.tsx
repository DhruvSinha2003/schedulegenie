// components/TaskInputForm.tsx
"use client"; // This component needs state and event handlers

import React, { useState } from "react";
import { FaMicrophone, FaStopCircle } from "react-icons/fa"; // Using react-icons

// Define the shape of the data we expect from the form
interface ScheduleInput {
  tasks: string;
  availability: string;
  flexibility: "rigid" | "flexible";
}

// Define the props the component will receive, including the submit handler
interface TaskInputFormProps {
  onSubmit: (data: ScheduleInput) => void; // Function to call when form is submitted
  isGenerating: boolean; // To disable button during generation
}

export default function TaskInputForm({
  onSubmit,
  isGenerating,
}: TaskInputFormProps) {
  const [tasks, setTasks] = useState("");
  const [availability, setAvailability] = useState("");
  const [flexibility, setFlexibility] = useState<"rigid" | "flexible">(
    "flexible"
  );
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<any>(null); // Store recognition instance

  // --- Web Speech API Logic ---
  React.useEffect(() => {
    // Check for browser support and initialize
    const SpeechRecognition =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; // Process speech chunks
      recognition.lang = "en-US";
      recognition.interimResults = false; // Get final results
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setTasks((prevTasks) =>
          prevTasks ? prevTasks + "\n" + transcript : transcript
        ); // Append transcript
        stopListening(recognition); // Stop after one phrase for now
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        stopListening(recognition);
      };

      recognition.onend = () => {
        // Ensure isListening is false if recognition stops unexpectedly
        if (isListening) {
          setIsListening(false);
        }
      };

      setSpeechRecognition(recognition);
    } else {
      console.warn("Web Speech API not supported in this browser.");
    }

    // Cleanup function to stop recognition if component unmounts while listening
    return () => {
      if (speechRecognition && isListening) {
        speechRecognition.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount, dependency array includes isListening to potentially manage onend state

  const startListening = () => {
    if (speechRecognition && !isListening) {
      try {
        navigator.mediaDevices
          .getUserMedia({ audio: true }) // Request mic permission explicitly
          .then(() => {
            speechRecognition.start();
            setIsListening(true);
          })
          .catch((err) => {
            console.error("Microphone access denied:", err);
            alert(
              "Microphone access is required for voice input. Please allow access."
            );
          });
      } catch (error) {
        console.error("Error starting speech recognition:", error);
        setIsListening(false); // Ensure state is correct if start fails
      }
    } else if (!speechRecognition) {
      alert("Speech recognition is not supported or enabled in your browser.");
    }
  };

  const stopListening = (recognitionInstance = speechRecognition) => {
    if (recognitionInstance && isListening) {
      try {
        recognitionInstance.stop();
      } catch (error) {
        console.error("Error stopping recognition:", error);
      } finally {
        setIsListening(false);
      }
    }
  };

  // --- Form Submission ---
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tasks.trim() || !availability.trim()) {
      alert("Please provide your tasks and availability.");
      return;
    }
    onSubmit({ tasks, availability, flexibility });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Task Input Area */}
      <div>
        <label
          htmlFor="tasks"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Tasks (One per line or dictated)
        </label>
        <div className="relative">
          <textarea
            id="tasks"
            name="tasks"
            rows={6}
            value={tasks}
            onChange={(e) => setTasks(e.target.value)}
            placeholder="e.g., Finish project report\nTeam meeting\nCall client"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
            disabled={isGenerating || isListening}
          />
          <button
            type="button"
            onClick={isListening ? () => stopListening() : startListening}
            disabled={!speechRecognition || isGenerating}
            title={isListening ? "Stop Dictating" : "Dictate Tasks"}
            className={`absolute bottom-2 right-2 p-2 rounded-full text-white transition-colors ${
              isListening
                ? "bg-red-500 hover:bg-red-600"
                : "bg-purple-500 hover:bg-purple-600"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isListening ? <FaStopCircle /> : <FaMicrophone />}
          </button>
        </div>
        {isListening && (
          <p className="text-sm text-purple-600 mt-1 animate-pulse">
            Listening...
          </p>
        )}
        {!speechRecognition && (
          <p className="text-xs text-red-500 mt-1">
            Voice input not supported by your browser.
          </p>
        )}
      </div>

      {/* Availability Input */}
      <div>
        <label
          htmlFor="availability"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Your Availability
        </label>
        <input
          type="text"
          id="availability"
          name="availability"
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
          placeholder="e.g., Mon 9am-5pm, Tue 1pm-6pm, Wed free"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
          disabled={isGenerating}
        />
        <p className="text-xs text-gray-500 mt-1">
          Be descriptive (days, times). Gemini will interpret this.
        </p>
      </div>

      {/* Flexibility Preference */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Scheduling Flexibility
        </label>
        <div className="flex items-center space-x-6">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="flexibility"
              value="flexible"
              checked={flexibility === "flexible"}
              onChange={() => setFlexibility("flexible")}
              className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 disabled:opacity-50"
              disabled={isGenerating}
            />
            <span className="text-sm text-gray-700">
              Flexible (Allow AI more freedom)
            </span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="flexibility"
              value="rigid"
              checked={flexibility === "rigid"}
              onChange={() => setFlexibility("rigid")}
              className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 disabled:opacity-50"
              disabled={isGenerating}
            />
            <span className="text-sm text-gray-700">
              Rigid (Stick closer to times)
            </span>
          </label>
        </div>
      </div>

      {/* Submit Button */}
      <div>
        <button
          type="submit"
          disabled={isGenerating || !tasks.trim() || !availability.trim()}
          className="w-full px-4 py-2 bg-green-500 text-white font-semibold rounded-md shadow-sm hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {isGenerating ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Generating...
            </>
          ) : (
            "Generate Schedule"
          )}
        </button>
      </div>
    </form>
  );
}
