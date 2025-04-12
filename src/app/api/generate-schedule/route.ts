// app/api/generate-schedule/route.ts
import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import crypto from 'crypto'; // For generating unique IDs
import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
if (!GEMINI_API_KEY) throw new Error("Missing GOOGLE_GEMINI_API_KEY");
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const USERS_COLLECTION = "users";
const SCHEDULES_COLLECTION = "schedules";

// Revised Schema Definition for Gemini
const jsonOutputSchema = `{
  "tasks": [
    {
      "content": "string (the original task description)",
      "day": "string (e.g., Monday, Tuesday, Specific Date YYYY-MM-DD)",
      "time": "string (assigned time block, e.g., 9:00 AM - 10:30 AM)",
      "notes": "string (optional: any notes from the AI, like duration assumptions)"
    }
  ],
  "notes": "string (optional: overall notes about the schedule generation)"
}`;

export async function POST(req: NextRequest) {
    let session;
    try {
        session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;
        const userEmail = session.user.email;
        const userName = session.user.name;
        const userPicture = session.user.picture;

        const body = await req.json();
        const { tasks: taskInputString, availability, flexibility } = body;

        if (!taskInputString || typeof taskInputString !== 'string' || taskInputString.trim() === "") {
             return NextResponse.json({ message: 'Tasks input cannot be empty.' }, { status: 400 });
         }

        const prompt = `
          You are StudioGenie, an AI scheduling assistant. Create a time-blocked schedule based on user input.

          User Input:
          - Tasks (one per line):
          ${taskInputString}
          - Availability: ${availability}
          - Scheduling Preference: ${flexibility}

          Instructions:
          1. Analyze tasks and availability.
          2. Create a schedule assigning time blocks (including day/date) to each task.
          3. Adhere strictly to availability.
          4. Consider flexibility preference.
          5. Estimate reasonable durations if needed, noting assumptions in task "notes".
          6. **Crucially:** For each task, provide an estimated start time as an ISO 8601 UTC timestamp in the "timestamp" field (e.g., "2024-07-30T14:30:00Z"). If a precise timestamp isn't feasible, set "timestamp" to null.
          7. Ensure the output is ONLY a valid JSON object matching this EXACT schema:
          ${jsonOutputSchema}
          Do NOT include any text/markdown before or after the JSON.
          If unable to schedule, return JSON with empty "tasks" array and explanation in main "notes".
        `;

        // Call Gemini API
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const generationConfig = {
             temperature: 0.5,
             topK: 1, topP: 1,
             maxOutputTokens: 4096,
             responseMimeType: "application/json",
        };
        // const safetySettings = [ ... ]; // Define safety settings if needed

        const result = await model.generateContent(prompt, generationConfig /*, safetySettings*/);
        const response = result.response;
        const rawJsonText = response.text();
        console.log("generate-schedule: Raw Gemini response:", rawJsonText);

        // Parse and Validate Gemini Response
        let parsedResponse;
        try {
            const cleanedJsonText = rawJsonText.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
             if (!cleanedJsonText) throw new Error("Received empty response from AI.");
            parsedResponse = JSON.parse(cleanedJsonText);

            if (typeof parsedResponse !== 'object' || parsedResponse === null || !Array.isArray(parsedResponse.tasks)) {
                 throw new Error("AI response validation failed: 'tasks' array missing or invalid.");
            }
        } catch (parseError) {
            console.error('generate-schedule: Error parsing Gemini response:', parseError, "\nRaw text:", rawJsonText);
            return NextResponse.json({ message: 'Failed to parse AI schedule response.' }, { status: 500 });
        }

        // Add unique IDs and completion status to tasks
        const processedTasks = parsedResponse.tasks.map((task: any) => ({
            taskId: crypto.randomUUID(), // Generate unique ID for each task
            content: task.content || 'Unnamed Task',
            day: task.day || 'Unspecified Day',
            time: task.time || 'Unspecified Time',
            timestamp: task.timestamp || null, // Use timestamp from Gemini or null
            isCompleted: false, // Default to not completed
            notes: task.notes || null,
        }));

        // Save/Update in MongoDB
        try {
            const client = await clientPromise;
            const db = client.db(DB_NAME);

            // Upsert User data (optional, but good practice)
            const usersCollection = db.collection(USERS_COLLECTION);
            await usersCollection.updateOne(
                { userId: userId },
                { $set: { email: userEmail, name: userName, picture: userPicture, lastLogin: new Date() }, $setOnInsert: { userId: userId, createdAt: new Date() } },
                { upsert: true }
            );

            // Upsert Schedule: Update tasks array for the user, or insert if new
            const schedulesCollection = db.collection(SCHEDULES_COLLECTION);
            const updateResult = await schedulesCollection.updateOne(
                { userId: userId }, // Find schedule by user ID
                {
                    $set: { // Replace the entire tasks array and update timestamp
                        tasks: processedTasks,
                        lastGeneratedAt: new Date(),
                    },
                    $setOnInsert: { // Set userId and creation date only if inserting new doc
                        userId: userId,
                        createdAt: new Date()
                    }
                },
                { upsert: true } // Create the document if it doesn't exist for this user
            );

            console.log(`generate-schedule: Schedule ${updateResult.upsertedCount ? 'created' : 'updated'} for user:`, userId, "Modified:", updateResult.modifiedCount);

        } catch (dbError) {
            console.error("generate-schedule: Error saving schedule to MongoDB:", dbError);
            // Log error but proceed to return data to user
        }

        // Return Generated Schedule (original response structure, tasks now include taskId etc)
        // We return the structure Gemini gave us, the frontend will use the processedTasks state
        return NextResponse.json({ tasks: processedTasks, notes: parsedResponse.notes }, { status: 200 });

    } catch (error: any) {
        console.error('Error in /api/generate-schedule:', error);
        return NextResponse.json({ message: error.message || 'Internal server error.' }, { status: 500 });
    }
}