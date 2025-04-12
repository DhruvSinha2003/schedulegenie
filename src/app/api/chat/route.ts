// app/api/chat/route.ts
import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
if (!GEMINI_API_KEY) throw new Error("Missing GOOGLE_GEMINI_API_KEY");
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const USERS_COLLECTION = "users";
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MINUTES = 10;

// Define chat message structure (simplified)
interface ChatMessage {
    role: 'user' | 'model'; // Gemini uses 'model' for AI responses
    parts: [{ text: string }];
}

export async function POST(req: NextRequest) {
    try {
        // Important: await cookies() before using getSession()
        const cookieStore = cookies();
        const session = await getSession({ req, cookieStore });
        
        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;

        // --- Rate Limiting Logic ---
        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const usersCollection = db.collection(USERS_COLLECTION);

        const user = await usersCollection.findOne({ userId: userId }, { projection: { chatRequestTimestamps: 1 } });
        const currentTimestamps = user?.chatRequestTimestamps || [];
        const windowStart = Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

        // Filter out old timestamps
        const recentTimestamps = currentTimestamps.filter((ts: Date) => new Date(ts).getTime() >= windowStart);

        if (recentTimestamps.length >= RATE_LIMIT_COUNT) {
            console.log(`Rate limit exceeded for user: ${userId}`);
            return NextResponse.json({
                message: `Rate limit exceeded. Please wait. Limit is ${RATE_LIMIT_COUNT} requests per ${RATE_LIMIT_WINDOW_MINUTES} minutes.`,
                limitExceeded: true
            }, { status: 429 }); 
        }

        // Add current timestamp and update DB *before* making AI call
        const newTimestamps = [...recentTimestamps, new Date()];
        await usersCollection.updateOne(
            { userId: userId },
            { $set: { chatRequestTimestamps: newTimestamps } }
        );
        console.log(`Rate limit check passed for user: ${userId}. Requests in window: ${newTimestamps.length}`);
        // --- End Rate Limiting ---

        const body = await req.json();
        // Expecting history: ChatMessage[] and potentially taskId for context
        const history: ChatMessage[] = body.history || [];

        if (!history || history.length === 0 || history[history.length - 1].role !== 'user') {
             return NextResponse.json({ message: 'Invalid chat history provided.' }, { status: 400 });
        }

        // Construct prompt/history for Gemini Chat
        // The SDK's chat method usually handles history formatting
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const chat = model.startChat({
             history: history.slice(0, -1), // Send all but the last user message as history
             // generationConfig: { maxOutputTokens: 500, temperature: 0.7 }, // Optional config
        });

        const lastUserMessage = history[history.length - 1].parts[0].text;

        const messageToSend = `User query: ${lastUserMessage}`;

        const result = await chat.sendMessage(messageToSend);
        const response = result.response;
        const aiResponseText = response.text();

        return NextResponse.json({ response: aiResponseText }, { status: 200 });

    } catch (error: any) {
        console.error('Error in /api/chat:', error);
        return NextResponse.json({ message: error.message || 'Internal server error during chat.' }, { status: 500 });
    }
}