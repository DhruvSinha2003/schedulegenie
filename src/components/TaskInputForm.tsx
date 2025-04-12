// components/TaskInputForm.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { FaMicrophone, FaSpinner, FaStopCircle } from "react-icons/fa";

interface ScheduleInput {
  tasks: string;
  availability: string;
  flexibility: "rigid" | "flexible";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRecognition = any;
type SpeechRecognitionEvent = any;
type SpeechRecognitionErrorEvent = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface TaskInputFormProps {
  onSubmit: (data: ScheduleInput) => void;
  isGenerating: boolean;
}

// Declare SpeechRecognition types for window object
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
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
  const [speechApiSupported, setSpeechApiSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // --- Web Speech API Logic ---
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechApiSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = true; // Keep listening until stopped
      recognition.lang = "en-US";
      recognition.interimResults = false; // We want final results

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + "\n"; // Add newline after each final utterance
          }
        }
        // Append the new transcript, ensuring a newline if tasks isn't empty
        setTasks(
          (prevTasks) =>
            (prevTasks ? prevTasks.trimEnd() + "\n" : "") +
            finalTranscript.trim()
        );
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error, event.message);
        // Handle common errors like 'no-speech' or 'audio-capture' gracefully
        if (
          event.error === "no-speech" ||
          event.error === "audio-capture" ||
          event.error === "not-allowed"
        ) {
          stopListening(); // Stop listening on these errors
        }
        // Consider showing a user-friendly message based on the error
      };

      recognition.onend = () => {
        // If recognition ends unexpectedly while we intended to listen, update state
        if (isListening) {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
    } else {
      setSpeechApiSupported(false);
    }

    // Cleanup: Stop recognition if component unmounts while listening
    return () => {
      if (recognitionRef.current && isListening) {
        recognitionRef.current.stop();
      }
    };
  }, [isListening]); // Re-run effect if isListening changes to manage onend state correctly

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      // Check/request microphone permission
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(() => {
          try {
            recognitionRef.current?.start();
            setIsListening(true);
          } catch (error) {
            console.error("Error starting speech recognition:", error);
            setIsListening(false); // Ensure state is correct if start fails
          }
        })
        .catch((err) => {
          console.error("Microphone access denied:", err);
          alert(
            "Microphone access is required for voice input. Please allow access in your browser settings."
          );
          setIsListening(false);
        });
    } else if (!speechApiSupported) {
      alert("Speech recognition is not supported or enabled in your browser.");
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
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
    if (isListening) {
      stopListening();
    }
    onSubmit({
      tasks: tasks.trim(),
      availability: availability.trim(),
      flexibility,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Task Input Area */}
      <div>
        <label
          htmlFor="tasks"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Tasks
        </label>
        <div className="relative">
          <textarea
            id="tasks"
            name="tasks"
            rows={6}
            value={tasks}
            onChange={(e) => setTasks(e.target.value)}
            placeholder={
              "e.g., Finish project report" +
              String.fromCharCode(10) +
              "Team meeting at 2pm" +
              String.fromCharCode(10) +
              "Call client about proposal"
            }
            className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
            disabled={isGenerating || isListening}
          />
          {speechApiSupported && (
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              disabled={isGenerating}
              title={isListening ? "Stop Dictating" : "Dictate Tasks"}
              className={`absolute bottom-2 right-2 p-2 rounded-full text-white transition-colors ${
                isListening
                  ? "bg-red-500 hover:bg-red-600 animate-pulse"
                  : "bg-purple-500 hover:bg-purple-600"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isListening ? (
                <FaStopCircle size={16} />
              ) : (
                <FaMicrophone size={16} />
              )}
            </button>
          )}
        </div>
        {isListening && (
          <p className="text-sm text-purple-600 mt-1">
            Listening... Say your tasks.
          </p>
        )}
        {!speechApiSupported && (
          <p className="text-xs text-gray-500 mt-1">
            Voice input not available in this browser.
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
          Be descriptive (days, times). e.g., Weekdays 10am to 4pm, except Wed
          morning
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
            <span className="text-sm text-gray-700">Flexible</span>
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
            <span className="text-sm text-gray-700">Rigid</span>
          </label>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Flexible allows AI more freedom, Rigid tries to stick closer to
          specified times.
        </p>
      </div>

      {/* Submit Button */}
      <div>
        <button
          type="submit"
          disabled={isGenerating || !tasks.trim() || !availability.trim()}
          className="w-full px-4 py-2 bg-green-600 text-white font-semibold rounded-md shadow-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {isGenerating ? (
            <>
              <FaSpinner className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
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
