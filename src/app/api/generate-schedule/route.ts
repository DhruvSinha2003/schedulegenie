// app/api/generate-schedule/route.ts
import clientPromise from '@/lib/mongodb'; // Ensure this path is correct
import { getSession } from '@auth0/nextjs-auth0';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("CRITICAL: GOOGLE_GEMINI_API_KEY is not set!");
    // Optionally throw an error during startup in non-dev environments
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const USERS_COLLECTION = "users";
const SCHEDULES_COLLECTION = "schedules";

// --- IMPORTANT: Define the expected JSON output structure for Gemini ---
const jsonOutputSchema = `{
  "schedule": [
    {
      "id": "string (unique identifier for the task, e.g., task-1)",
      "content": "string (the original task description)",
      "day": "string (e.g., Monday, Tuesday, Specific Date if possible)",
      "time": "string (assigned time block, e.g., 9:00 AM - 10:30 AM)",
      "notes": "string (optional: any notes from the AI, like duration assumptions)"
    }
  ],
  "notes": "string (optional: overall notes about the schedule generation, e.g., warnings)"
}`;

export async function POST(req: NextRequest) {
    let session;
    try {
        // 1. Check Authentication
        session = await getSession();
        if (!session || !session.user) {
            console.log("generate-schedule: Unauthorized access attempt.");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;
        const userEmail = session.user.email;
        const userName = session.user.name;
        const userPicture = session.user.picture;
        console.log("generate-schedule: Authorized access for user:", userId);

        // 2. Parse Request Body
        const body = await req.json();
        const { tasks, availability, flexibility } = body;

        // **Crucial Validation:** Ensure inputs are present before sending to Gemini
        if (!tasks || typeof tasks !== 'string' || tasks.trim() === "") {
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
        console.log(`generate-schedule: Input received for user ${userId}:`, { tasks, availability, flexibility });


        // 3. Construct the Prompt for Gemini (Ensure all data is included)
        const prompt = `
          You are StudioGenie, an AI scheduling assistant. Your goal is to create a time-blocked schedule based on the user's input.

          User Input:
          - Tasks (one per line, treat each line as a distinct task):
          ${tasks}
          - Availability: ${availability}
          - Scheduling Preference: ${flexibility} (${flexibility === 'rigid' ? 'Try to stick closely to explicit times mentioned if any, minimize gaps.' : 'Optimize task order and timing for efficiency, allow reasonable gaps.'})

          Instructions:
          1. Analyze the tasks and the user's availability.
          2. Create a schedule assigning specific time blocks (including the day or date if inferrable from the availability description) to each task provided.
          3. Adhere strictly to the user's availability constraints. Do not schedule tasks outside the specified times/days.
          4. Consider the flexibility preference when ordering tasks and assigning times.
          5. Estimate reasonable durations for tasks if not specified (e.g., 'meeting' might be 1 hour, 'write report' might be 2-3 hours). Add a note in the task's "notes" field if you make duration assumptions.
          6. Ensure the output is ONLY a valid JSON object matching this EXACT schema:
          ${jsonOutputSchema}

          Do NOT include any introductory text, closing remarks, apologies, or markdown formatting like \`\`\`json or \`\`\` before or after the JSON object. Just output the raw JSON object.
          If you cannot create a schedule for *any* reason (e.g., conflicting requirements, not enough time, unclear input), return a JSON object with an empty "schedule" array and an explanation in the main "notes" field. Example: { "schedule": [], "notes": "Could not schedule all tasks due to insufficient time based on the provided availability." }
        `;
        // console.log("generate-schedule: Prompt sent to Gemini:\n", prompt); // Optional: Log prompt for debugging


        // 4. Call Gemini API
        console.log("generate-schedule: Calling Gemini API for user:", userId);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Ensure correct model name

        const generationConfig = {
            temperature: 0.5, // Slightly less creative for scheduling
            topK: 1,
            topP: 1,
            maxOutputTokens: 4096, // Increased token limit
            responseMimeType: "application/json", // Crucial for direct JSON output
        };

        // Safety settings (adjust thresholds as needed)
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ];

        const result = await model.generateContent(
            prompt // Pass the constructed prompt string
            // Uncomment safetySettings if needed/supported by the specific generateContent method signature you use
            // , { generationConfig, safetySettings } - structure might vary, check SDK docs
        ); // Pass config directly if generateContent accepts it like this

        const response = result.response;
        const rawJsonText = response.text(); // Get raw text
        console.log("generate-schedule: Raw response received from Gemini for user:", userId, "\n", rawJsonText);


        // 5. Parse Gemini Response (with cleaning, just in case)
        let scheduleData;
        try {
            // Clean the text: Remove potential markdown fences and trim whitespace
            const cleanedJsonText = rawJsonText
                .replace(/^```json\s*/, '') // Remove ```json at the start
                .replace(/```\s*$/, '')    // Remove ``` at the end
                .trim();

            if (!cleanedJsonText) {
                 throw new Error("Received empty response from AI after cleaning.");
            }

            // Now parse the cleaned text
            scheduleData = JSON.parse(cleanedJsonText);

            // Basic validation - check if 'schedule' key exists and is an array
             if (typeof scheduleData !== 'object' || scheduleData === null || !Array.isArray(scheduleData.schedule)) {
                 console.error("generate-schedule: Gemini response validation failed after cleaning: 'schedule' array missing or not an array.", cleanedJsonText);
                 throw new Error("AI returned an unexpected schedule format.");
             }
            console.log("generate-schedule: Successfully parsed Gemini response for user:", userId);

        } catch (parseError) {
            console.error('generate-schedule: Error parsing Gemini JSON response:', parseError);
            console.error('generate-schedule: Received raw text from Gemini:', rawJsonText); // Log what was received
            return NextResponse.json({ message: 'Failed to parse AI schedule response. Please check the format of the AI output.' }, { status: 500 });
        }


        // 6. Save to MongoDB
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
             // console.log("generate-schedule: User data upserted for:", userId); // Optional log

            // Insert the new schedule
            const schedulesCollection = db.collection(SCHEDULES_COLLECTION);
            const scheduleToInsert = {
                userId: userId,
                tasksInput: tasks,
                availabilityInput: availability,
                flexibilityInput: flexibility,
                generatedSchedule: scheduleData.schedule, // Store the array of tasks
                notes: scheduleData.notes || null,       // Store optional notes
                createdAt: new Date(),
            };
            const insertResult = await schedulesCollection.insertOne(scheduleToInsert);
            console.log("generate-schedule: Schedule saved to MongoDB with ID:", insertResult.insertedId, "for user:", userId);

        } catch (dbError) {
            console.error("generate-schedule: Error saving to MongoDB for user:", userId, dbError);
            // Continue, but maybe add a warning to the response?
             // scheduleData.dbSaveWarning = "Failed to save this schedule to the database.";
        }

        // 7. Return Generated Schedule to Frontend
        console.log("generate-schedule: Returning successful schedule response to user:", userId);
        return NextResponse.json(scheduleData, { status: 200 });

    } catch (error: any) {
        console.error('Error in /api/generate-schedule:', error);
        if (session?.user?.sub) {
            console.error('Error occurred for user:', session.user.sub);
        }
        // Provide more context if it's a known error type
        let errorMessage = 'An internal server error occurred.';
        if (error.message) {
            errorMessage = error.message;
        }
        // You might want to check specific error types (e.g., from Gemini SDK)
        // if (error instanceof GoogleGenerativeAIError) { ... }

        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
}