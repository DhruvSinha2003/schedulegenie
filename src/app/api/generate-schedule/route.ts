// app/api/generate-schedule/route.ts
import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto'; // For generating unique IDs
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("CRITICAL: GOOGLE_GEMINI_API_KEY is not set!");
    // Optionally throw an error during startup in non-dev environments
    // For a hackathon, logging might be sufficient.
}
// Initialize only if the key exists to prevent crashes during build/startup if missing
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const USERS_COLLECTION = "users";
const SCHEDULES_COLLECTION = "schedules";

// Revised Schema for Gemini (No timestamp)
const jsonOutputSchema = `{
  "tasks": [
    {
      "content": "string (the original task description)",
      "day": "string (Full date YYYY-MM-DD or day name like Monday, Tuesday)",
      "time": "string (assigned time block, e.g., 9:00 AM - 10:30 AM)",
      "notes": "string (optional: any notes from the AI, like duration assumptions)"
    }
  ],
  "notes": "string (optional: overall notes about the schedule generation)"
}`;

export async function POST(req: NextRequest) {
    try {
        // Ensure Gemini Client is initialized
        if (!genAI) {
            console.error("generate-schedule: Gemini API key missing or client not initialized.");
            return NextResponse.json({ message: 'AI service configuration error.' }, { status: 500 });
        }

        // Important: await cookies() before using getSession()
        const cookieStore = cookies();
        const session = await getSession({ req, cookieStore });
        
        if (!session || !session.user) {
            console.log("generate-schedule: Unauthorized access attempt.");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;
        const userEmail = session.user.email;
        const userName = session.user.name;
        const userPicture = session.user.picture;
        console.log("generate-schedule: Authorized access for user:", userId);

        const body = await req.json();
        const { tasks: taskInputString, availability, flexibility } = body;

        if (!taskInputString || typeof taskInputString !== 'string' || taskInputString.trim() === "") {
            console.error("generate-schedule: 'tasks' field is missing or empty for user:", userId);
            return NextResponse.json({ message: 'Tasks input cannot be empty.' }, { status: 400 });
        }
        if (!availability || typeof availability !== 'string' || availability.trim() === "") {
            console.error("generate-schedule: 'availability' field is missing or empty for user:", userId);
            return NextResponse.json({ message: 'Availability input cannot be empty.' }, { status: 400 });
        }
        if (!flexibility || (flexibility !== 'rigid' && flexibility !== 'flexible')) {
            console.error("generate-schedule: Invalid 'flexibility' value:", flexibility, "for user:", userId);
            return NextResponse.json({ message: 'Invalid flexibility value.' }, { status: 400 });
        }
        console.log(`generate-schedule: Input received for user ${userId}:`, { tasks: taskInputString.substring(0,100)+'...', availability, flexibility });

        // Get current time for Gemini context
        const now = new Date();

        // Updated Prompt for better date/day ordering
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
          3. **Crucially:** Order the tasks chronologically based on the current date and availability. Ensure days like 'Saturday' and 'Monday' appear in the correct future sequence relative to the current date.
          4. **Use full dates (YYYY-MM-DD) in the 'day' field whenever possible**, otherwise use the day name (e.g., Monday). This helps with sorting.
          5. Consider flexibility preference.
          6. Estimate reasonable durations if needed, noting assumptions in task "notes".
          7. Ensure the output is ONLY a valid JSON object matching this EXACT schema:
          ${jsonOutputSchema}
          Do NOT include any introductory text, closing remarks, apologies, or markdown formatting like \`\`\`json or \`\`\` before or after the JSON object. Just output the raw JSON object.
          If unable to schedule, return JSON with empty "tasks" array and explanation in main "notes".
        `;

        // Call Gemini API
        console.log("generate-schedule: Calling Gemini API for user:", userId);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const generationConfig = {
            temperature: 0.5,
            topK: 1, topP: 1,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
        };

        const result = await model.generateContent(prompt, generationConfig);
        const response = result.response;
        const rawJsonText = response.text();
        console.log("generate-schedule: Raw Gemini response received for user:", userId);

        // Parse and Validate Gemini Response
        let parsedResponse;
        try {
            const cleanedJsonText = rawJsonText.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
            if (!cleanedJsonText) throw new Error("Received empty response from AI after cleaning.");
            parsedResponse = JSON.parse(cleanedJsonText);

            if (typeof parsedResponse !== 'object' || parsedResponse === null || !Array.isArray(parsedResponse.tasks)) {
                console.error("generate-schedule: Gemini response validation failed after cleaning: 'tasks' array missing or invalid.", cleanedJsonText);
                throw new Error("AI returned an unexpected schedule format.");
            }
            console.log("generate-schedule: Successfully parsed Gemini response for user:", userId);

        } catch (parseError) {
            console.error('generate-schedule: Error parsing Gemini JSON response:', parseError, "\nRaw text:", rawJsonText);
            return NextResponse.json({ message: 'Failed to parse AI schedule response. Please check the AI output format.' }, { status: 500 });
        }

        // Process tasks (Add ID, completion status - NO timestamp)
        const processedTasks = parsedResponse.tasks.map((task: any) => ({
            taskId: crypto.randomUUID(),
            content: task.content || 'Unnamed Task',
            day: task.day || 'Unspecified Day', // Ensure day is present
            time: task.time || 'Unspecified Time', // Ensure time is present
            isCompleted: false,
            notes: task.notes || null,
        }));

        // Save/Update in MongoDB
        try {
            const client = await clientPromise;
            const db = client.db(DB_NAME);

            // Upsert User data
            const usersCollection = db.collection(USERS_COLLECTION);
            await usersCollection.updateOne(
                { userId: userId },
                { $set: { email: userEmail, name: userName, picture: userPicture, lastLogin: new Date() }, $setOnInsert: { userId: userId, createdAt: new Date() } },
                { upsert: true }
            );

            // Upsert Schedule: Replace tasks array
            const schedulesCollection = db.collection(SCHEDULES_COLLECTION);
            const updateResult = await schedulesCollection.updateOne(
                { userId: userId },
                {
                    $set: {
                        tasks: processedTasks,
                        lastGeneratedAt: new Date(),
                    },
                    $setOnInsert: {
                        userId: userId,
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );

            console.log(`generate-schedule: Schedule ${updateResult.upsertedCount ? 'created' : 'updated'} for user:`, userId, "Modified:", updateResult.modifiedCount);

        } catch (dbError) {
            console.error("generate-schedule: Error saving schedule to MongoDB for user:", userId, dbError);
            // Log error but proceed to return data to user
        }

        // Return the processed tasks (including taskId, isCompleted) and notes
        console.log("generate-schedule: Returning successful schedule response to user:", userId);
        return NextResponse.json({ tasks: processedTasks, notes: parsedResponse.notes || null }, { status: 200 });

    } catch (error: any) {
        console.error('Error in /api/generate-schedule:', error);
        return NextResponse.json({ message: error.message || 'An internal server error occurred during schedule generation.' }, { status: 500 });
    }
}