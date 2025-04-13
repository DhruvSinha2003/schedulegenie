// src/app/api/get-task/[taskId]/route.ts
import clientPromise from '@/lib/mongodb';
// Use the STANDARD getSession for serverless API routes
import { getSession } from '@auth0/nextjs-auth0';
// Import NextRequest and NextResponse
import { NextRequest, NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";

// Define an interface for the expected structure AFTER the params promise resolves
interface ResolvedParams {
    taskId: string;
}

// Define the structure of the context object as received
interface RouteContext {
    params: Promise<ResolvedParams>; // params is a Promise here!
}

export async function GET(
    req: NextRequest,
    context: RouteContext // The context object containing the params promise
) {
    console.log('Received context object:', context); // Should show params as Promise

    try {
        // --- Await the params Promise directly ---
        const params = await context.params;
        console.log('Resolved params object:', params); // Should show the actual params { taskId: '...' }

        // Ensure params resolved correctly
        if (!params || typeof params.taskId !== 'string') {
             console.error("Error: Invalid or missing taskId in resolved params.", params);
             return NextResponse.json({ message: 'Internal server error: Could not resolve task ID.' }, { status: 500 });
        }

        // Access taskId from the RESOLVED params object
        const taskId = params.taskId;
        console.log('Accessed taskId:', taskId);

        // --- Authentication and Database Logic ---
        const res = new NextResponse();
        const session = await getSession(req, res); // Pass req/res

        if (!session || !session.user) {
            // Middleware should catch this, but belt-and-suspenders
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.sub;

        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const schedulesCollection = db.collection(SCHEDULES_COLLECTION);

        // Find the schedule and project only the matching task
        const schedule = await schedulesCollection.findOne(
            { userId: userId, "tasks.taskId": taskId },
            { projection: { "tasks.$": 1 } }
        );

        if (!schedule || !schedule.tasks || schedule.tasks.length === 0) {
            return NextResponse.json({ message: 'Task not found or access denied.' }, { status: 404 });
        }

        const task = schedule.tasks[0];

        // Return the task data, including any headers potentially set by Auth0
        return NextResponse.json({ task }, { status: 200, headers: res.headers });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Error in /api/get-task/[taskId]:', error);
        // Log context during error
        console.error('Context object during error:', context);
        try {
            const resolvedParamsOnError = await context.params;
            console.error('Resolved params during error:', resolvedParamsOnError);
        } catch (resolveError) {
            console.error('Could not resolve params during error handler:', resolveError);
        }
        return NextResponse.json({ message: error.message || 'Internal server error.' }, { status: 500 });
    }
}