// app/api/generate-schedule/route.ts
import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("CRITICAL: GOOGLE_GEMINI_API_KEY is not set!");
    // Consider throwing an error or handling differently if the key is absolutely required
}
// Initialize genAI conditionally
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const USERS_COLLECTION = "users";
const SCHEDULES_COLLECTION = "schedules";

// Schema definition for the AI
const jsonOutputSchema = `{
  "tasks": [
    {
      "content": "string (the task description - try to make this concise and professional if the input is conversational)",
      "day": "string (Full date YYYY-MM-DD or day name like Monday, Tuesday)",
      "time": "string (assigned time block, e.g., 9:00 AM - 10:30 AM)",
      "notes": "string (optional: any notes from the AI, like duration assumptions)"
    }
  ],
  "notes": "string (optional: overall notes about the schedule generation)"
}`;

export async function POST(req: NextRequest) { // Takes req
    try {
        if (!genAI) {
            console.error("generate-schedule: Gemini API key missing or client not initialized.");
            return NextResponse.json({ message: 'AI service configuration error.' }, { status: 500 });
        }

        const res = new NextResponse(); // Create res
        const session = await getSession(req, res); // Pass req, res

        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;
        // Use nullish coalescing for safety, although Auth0 usually provides these
        const userEmail = session.user.email ?? 'N/A';
        const userName = session.user.name ?? session.user.nickname ?? 'User';
        const userPicture = session.user.picture ?? null;

        const body = await req.json();
        const { tasks: taskInputString, availability, flexibility } = body;

        // Input validation
        if (!taskInputString || typeof taskInputString !== 'string' || taskInputString.trim() === "") {
            return NextResponse.json({ message: 'Tasks input cannot be empty.' }, { status: 400 });
        }
        if (!availability || typeof availability !== 'string' || availability.trim() === "") {
            return NextResponse.json({ message: 'Availability input cannot be empty.' }, { status: 400 });
        }
        if (!flexibility || (flexibility !== 'rigid' && flexibility !== 'flexible')) {
            return NextResponse.json({ message: 'Invalid flexibility value.' }, { status: 400 });
        }

        const now = new Date();

        // Construct the prompt for the AI
        const prompt = `
          You are StudioGenie, an AI scheduling assistant. Create a time-blocked schedule based on user input.
          The current reference date is ${now.toDateString()}. Use this to interpret relative terms like "today", "tomorrow", "Saturday", "Monday".

          User Input:
          - Tasks (one per line):
          ${taskInputString}
          - Availability: ${availability}
          - Scheduling Preference: ${flexibility} (${flexibility === 'rigid' ? 'Try to stick closely to explicit times mentioned if any, minimize gaps.' : 'Optimize task order and timing for efficiency, allow reasonable gaps.'})

          Instructions:
          1. Analyze tasks and availability. Create a schedule assigning time blocks to each task.
          2. Adhere strictly to availability.
          3. **For the 'content' field:** If the user input for a task is long or conversational, summarize it into a concise, professional-sounding task description. Otherwise, use the user's input directly. Keep the core meaning.
          4. **Crucially:** Order the tasks chronologically based on the current date and availability. Ensure days like 'Saturday' and 'Monday' appear in the correct future sequence relative to the current date.
          5. **Use full dates (YYYY-MM-DD) in the 'day' field whenever possible**, otherwise use the day name (e.g., Monday). This helps with sorting.
          6. Consider flexibility preference.
          7. Estimate reasonable durations if needed, noting assumptions in task "notes".
          8. Ensure the output is ONLY a valid JSON object matching this EXACT schema:
          ${jsonOutputSchema}
          Do NOT include any introductory text, closing remarks, apologies, or markdown formatting like \`\`\`json or \`\`\` before or after the JSON object. Just output the raw JSON object.
          If unable to schedule, return JSON with empty "tasks" array and explanation in main "notes".
        `;

        // Select the Gemini model
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }); 

        // Call the AI model
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.5,
                maxOutputTokens: 4096, // Adjust as needed
                 // Consider adding if you consistently want JSON:
                // responseMimeType: 'application/json',
            }
        });

        const response = result.response;
        // Ensure response exists before trying to access text()
        if (!response) {
             console.error("generate-schedule: No response received from Gemini model.");
             throw new Error("AI model did not return a response.");
        }
        const rawJsonText = response.text(); // Get raw text first

        // Parse and Validate Gemini Response
        let parsedResponse;
        try {
            // Robust cleaning: Remove potential markdown fences and trim whitespace
            const cleanedJsonText = rawJsonText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
            if (!cleanedJsonText) {
                console.error("generate-schedule: Received empty response from AI after cleaning.");
                throw new Error("Received empty response from AI after cleaning.");
            }

            // Attempt to parse the cleaned text
            parsedResponse = JSON.parse(cleanedJsonText);

            // Validate the structure
            if (typeof parsedResponse !== 'object' || parsedResponse === null || !Array.isArray(parsedResponse.tasks)) {
                console.error("generate-schedule: Gemini response validation failed: 'tasks' array missing or invalid.", cleanedJsonText);
                throw new Error("AI returned an unexpected schedule format.");
            }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (parseError: any) {
            console.error('generate-schedule: Error parsing Gemini JSON:', parseError, "\nRaw text received:", rawJsonText);
            // Return a user-friendly error indicating a parsing issue
            return NextResponse.json({ message: 'Failed to parse AI schedule response. The AI might have returned an invalid format.' }, { status: 500 });
        }

        // Process tasks (Add ID, completion status)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newTasks = parsedResponse.tasks.map((task: any) => ({
            taskId: crypto.randomUUID(),
            content: task.content || 'Unnamed Task', // Default content if missing
            day: task.day || 'Unspecified Day',     // Default day if missing
            time: task.time || 'Unspecified Time',   // Default time if missing
            isCompleted: false,                     // Default completion status
            notes: task.notes || null,              // Handle optional notes
        }));

        // --- Append to Existing Schedule ---
        try {
            const client = await clientPromise;
            const db = client.db(DB_NAME);

            // Upsert User data
            const usersCollection = db.collection(USERS_COLLECTION);
            await usersCollection.updateOne(
                { userId: userId },
                {
                    $set: { email: userEmail, name: userName, picture: userPicture, lastLogin: new Date() },
                    $setOnInsert: { userId: userId, createdAt: new Date() }
                },
                { upsert: true }
            );

            // Fetch existing tasks
            const schedulesCollection = db.collection(SCHEDULES_COLLECTION);
            const existingSchedule = await schedulesCollection.findOne({ userId: userId }, { projection: { tasks: 1 } });
            const existingTasks = existingSchedule?.tasks || [];

            // Combine old and new tasks
            const allTasks = [...existingTasks, ...newTasks];

            // Update the schedule document with the combined list
            await schedulesCollection.updateOne(
                { userId: userId },
                {
                    $set: {
                        tasks: allTasks, // Set the combined array
                        lastGeneratedAt: new Date(),
                        notes: parsedResponse.notes || null // Store overall notes if provided
                    },
                    $setOnInsert: {
                        userId: userId,
                        createdAt: new Date() // Set createdAt only on insert
                    }
                },
                { upsert: true } // Create the document if it doesn't exist
            );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (dbError: any) {
            console.error("generate-schedule: Error saving/updating schedule to MongoDB:", dbError);
            // Return error but maybe still let user see generated tasks if AI call succeeded?
            // For now, let's return an error status.
             return NextResponse.json({ message: 'Failed to save the generated schedule to the database.' }, { status: 500 });
        }

        // Fetch the updated schedule to return the full list
        const finalSchedule = await clientPromise.then(client => client.db(DB_NAME).collection(SCHEDULES_COLLECTION).findOne({ userId: userId }));
        return NextResponse.json(
            {
                tasks: finalSchedule?.tasks || [], // Ensure tasks array is always returned
                notes: finalSchedule?.notes || null
            },
            { status: 200, headers: res.headers } // Pass headers
        );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Error in /api/generate-schedule:', error);
        const message = error instanceof Error ? error.message : 'An internal server error occurred.';
        // Handle specific AI errors like safety blocks
        // Gemini API errors might have specific structures, check documentation if needed
        if (error.message && error.message.includes("SAFETY")) {
             return NextResponse.json({ message: 'The AI declined to generate a schedule due to safety concerns with the input or output.' }, { status: 400 });
        }
        // Generic error response
        return NextResponse.json({ message }, { status: 500 });
    }
}