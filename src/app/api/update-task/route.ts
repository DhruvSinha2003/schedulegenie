// src/app/api/update-task/route.ts
import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0';
import { NextRequest, NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";

export async function PATCH(req: NextRequest) { // Takes req
    try {
        const res = new NextResponse(); // Create res
        const session = await getSession(req, res); // Pass req, res

        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;

        const body = await req.json();
        const { taskId, isCompleted } = body;

        // Validate input
        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json({ message: 'Missing or invalid taskId.' }, { status: 400 });
        }
        if (typeof isCompleted !== 'boolean') {
             return NextResponse.json({ message: 'Missing or invalid isCompleted status (must be true or false).' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const schedulesCollection = db.collection(SCHEDULES_COLLECTION);

        // Use arrayFilters to target the specific task within the array
        const result = await schedulesCollection.updateOne(
            { userId: userId }, // Find the user's schedule document
            { $set: { "tasks.$[elem].isCompleted": isCompleted } }, // Set the isCompleted field
            { arrayFilters: [{ "elem.taskId": taskId }] } // Filter condition for the element matching the taskId
        );

        if (result.matchedCount === 0) {
             // User's schedule document wasn't found at all
             console.log("update-task: No schedule found for user:", userId);
            return NextResponse.json({ message: 'Schedule not found for user.' }, { status: 404 });
        }
        if (result.modifiedCount === 0) {
            // Schedule was found, but the task wasn't updated.
            // Check if the task exists to differentiate "not found" from "status already correct".
            console.log("update-task: Task not found or status unchanged for taskId:", taskId, "User:", userId);
             const check = await schedulesCollection.findOne(
                 { userId: userId, "tasks.taskId": taskId },
                 { projection: { _id: 1 } } // Only need to know if it exists
             );
             if (!check) {
                 // Task genuinely doesn't exist within the found schedule
                 return NextResponse.json({ message: 'Task not found.' }, { status: 404 });
             }
             // If task exists, it means status was already correct, so treat as success.
             // No need to return an error here, the state is as requested.
             console.log("update-task: Task status was already set to", isCompleted);
        } else {
             // Task was successfully updated
             console.log("update-task: Task updated successfully for taskId:", taskId, "User:", userId, "New status:", isCompleted);
        }

        // Return success even if modifiedCount was 0 but the task exists with the correct state
        return NextResponse.json({ message: 'Task updated successfully.' }, { status: 200, headers: res.headers }); // Pass headers

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Error in /api/update-task:', error);
        return NextResponse.json({ message: error.message || 'Internal server error.' }, { status: 500 });
    }
}