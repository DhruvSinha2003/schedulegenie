import { getSession } from '@auth0/nextjs-auth0'; // To get user session server-side
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
// Import MongoDB client utility (we'll create this next)
// import clientPromise from '@/lib/mongodb';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!); // Add '!' to assert it's defined (ensure it is in .env)

// --- IMPORTANT: Define the expected JSON output structure for Gemini ---
// This helps Gemini return data consistently. Be specific!
const jsonOutputSchema = `{
  "schedule": [
    {
      "id": "string (unique identifier for the task, e.g., task-1)",
      "content": "string (the original task description)",
      "day": "string (e.g., Monday, Tuesday, Specific Date if possible)",
      "time": "string (assigned time block, e.g., 9:00 AM - 10:30 AM)",
      "notes": "string (optional: any notes from the AI)"
    }
  ]
}`;

export async function POST(req: NextRequest) {
  try {
    // 1. Check Authentication
    const session = await getSession();
    if (!session || !session.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.sub; // Get the unique Auth0 user ID

    // 2. Parse Request Body
    const body = await req.json();
    const { tasks, availability, flexibility } = body;

    if (!tasks || !availability || !flexibility) {
      return NextResponse.json({ message: 'Missing required fields: tasks, availability, flexibility' }, { status: 400 });
    }

    // 3. Construct the Prompt for Gemini
    const prompt = `
      You are StudioGenie, an AI scheduling assistant. Your goal is to create a time-blocked schedule based on the user's input.

      User Input:
      - Tasks (one per line):
      ${tasks}
      - Availability: ${availability}
      - Scheduling Preference: ${flexibility} (${flexibility === 'rigid' ? 'Try to stick closely to explicit times mentioned if any, minimize gaps.' : 'Optimize task order and timing for efficiency, allow reasonable gaps.'})

      Instructions:
      1. Analyze the tasks and availability.
      2. Create a schedule assigning time blocks (including day/date if possible based on availability description) to each task.
      3. Consider the flexibility preference.
      4. Account for potential implicit task durations or estimate reasonable ones if not specified (e.g., 'meeting' might be 1 hour, 'write report' might be 2-3 hours). Add a note if you make assumptions.
      5. Ensure the output is ONLY a valid JSON object matching this EXACT schema:
      ${jsonOutputSchema}

      Do NOT include any text before or after the JSON object. Just the JSON.
      If you cannot create a schedule (e.g., conflicting requirements, not enough time), return a JSON with an empty "schedule" array and a note explaining why. Example: { "schedule": [], "notes": "Could not schedule Task X due to time constraints." }
    `;

    // 4. Call Gemini API
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Or other suitable model like gemini-pro

    const generationConfig = {
         temperature: 0.6, // Adjust creativity vs predictability
         topK: 1,
         topP: 1,
         maxOutputTokens: 2048, // Increase if needed for long schedules
         // Ensure response is JSON
         responseMimeType: "application/json",
    };

     const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    const result = await model.generateContent(prompt, generationConfig, /* safetySettings - might be implicitly part of the model call or configure separately if needed */);
    const response = result.response;
    const jsonText = response.text();

    // 5. Parse Gemini Response (it should already be JSON due to responseMimeType)
    let scheduleData;
    try {
        scheduleData = JSON.parse(jsonText);
        // Basic validation - check if 'schedule' key exists and is an array
         if (!scheduleData || !Array.isArray(scheduleData.schedule)) {
             console.error("Gemini response validation failed: 'schedule' array missing or not an array.", jsonText);
             throw new Error("AI returned an unexpected schedule format.");
         }
    } catch (parseError) {
        console.error('Error parsing Gemini JSON response:', parseError);
        console.error('Received text from Gemini:', jsonText); // Log what was received
        return NextResponse.json({ message: 'Failed to parse AI schedule response.' }, { status: 500 });
    }


    // 6. TODO: Save to MongoDB (Associate with userId)
    // Example (requires mongodb utility):
    /*
    try {
        const client = await clientPromise;
        const db = client.db("StudioGenieDB"); // Use a specific database name
        const schedulesCollection = db.collection("schedules");

        // Store the raw input and the generated output
        await schedulesCollection.insertOne({
            userId: userId, // Link schedule to the logged-in user
            tasksInput: tasks,
            availabilityInput: availability,
            flexibilityInput: flexibility,
            generatedSchedule: scheduleData.schedule, // Store the array of tasks
            createdAt: new Date(),
        });
        console.log("Schedule saved to MongoDB for user:", userId);
    } catch (dbError) {
        console.error("Error saving schedule to MongoDB:", dbError);
        // Decide if you want to fail the request or just log the error
        // return NextResponse.json({ message: 'Failed to save schedule to database.' }, { status: 500 });
    }
    */

    // 7. Return Generated Schedule to Frontend
    // Return the whole parsed object which might include notes etc.
    return NextResponse.json(scheduleData, { status: 200 });

  } catch (error: any) {
    console.error('Error in /api/generate-schedule:', error);
    // Check for specific Gemini errors if possible
    return NextResponse.json({ message: error.message || 'An internal server error occurred.' }, { status: 500 });
  }
}