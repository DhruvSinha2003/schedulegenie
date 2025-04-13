// app/api/edit-task/route.ts
import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0';
import { NextRequest, NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";

// Define allowed fields for update
const ALLOWED_UPDATE_FIELDS = ['content', 'day', 'time', 'notes'];

export async function PATCH(req: NextRequest) {
    try {
        const session = await getSession();
        
        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;

        const body = await req.json();
        const { taskId, updates } = body;

        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json({ message: 'Missing or invalid taskId.' }, { status: 400 });
        }
        if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
            return NextResponse.json({ message: 'Missing or invalid updates object.' }, { status: 400 });
        }
        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ message: 'No update fields provided.' }, { status: 400 });
        }

        // Build the $set object safely
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateFields: Record<string, any> = {};
        let hasValidUpdate = false;
        for (const key of Object.keys(updates)) {
            if (ALLOWED_UPDATE_FIELDS.includes(key)) {
                // Basic validation
                if (key === 'notes' && updates[key] !== null && typeof updates[key] !== 'string') {
                    continue; // skip invalid notes type
                }
                if (key !== 'notes' && (typeof updates[key] !== 'string' || updates[key].trim() === '')) {
                    // Require non-empty strings for content, day, time
                    continue;
                }
                // MongoDB field path using arrayFilters element 'elem'
                updateFields[`tasks.$[elem].${key}`] = updates[key];
                hasValidUpdate = true;
            }
        }

        if (!hasValidUpdate) {
            return NextResponse.json({ message: 'No valid update fields provided.' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const schedulesCollection = db.collection(SCHEDULES_COLLECTION);

        // Use arrayFilters to target the specific task within the array
        const result = await schedulesCollection.updateOne(
            { userId: userId }, // Find the user's schedule document
            { $set: updateFields }, // Set the specified fields
            { arrayFilters: [{ "elem.taskId": taskId }] } // Filter condition for the element
        );

        if (result.matchedCount === 0) {
            return NextResponse.json({ message: 'Schedule not found for user.' }, { status: 404 });
        }
        if (result.modifiedCount === 0) {
            // This could mean the task wasn't found OR the data was already the same
            const check = await schedulesCollection.findOne({ userId: userId, "tasks.taskId": taskId });
            if (!check) {
                return NextResponse.json({ message: 'Task not found within the schedule.' }, { status: 404 });
            }
            // If task exists, it means data was already correct, treat as success
        }

        return NextResponse.json({ message: 'Task updated successfully.' }, { status: 200 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Error in /api/edit-task:', error);
        // Avoid leaking detailed internal errors in production
        const message = error instanceof Error ? error.message : 'Internal server error.';
        return NextResponse.json({ message }, { status: 500 });
    }
}