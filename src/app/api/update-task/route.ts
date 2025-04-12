import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0';
import { NextRequest, NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";

export async function PATCH(req: NextRequest) { // Use PATCH for partial updates
    let session;
    try {
        session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;

        const body = await req.json();
        const { taskId, isCompleted } = body;

        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json({ message: 'Missing or invalid taskId.' }, { status: 400 });
        }
        if (typeof isCompleted !== 'boolean') {
             return NextResponse.json({ message: 'Missing or invalid isCompleted status.' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const schedulesCollection = db.collection(SCHEDULES_COLLECTION);

        // Use arrayFilters to target the specific task within the array
        const result = await schedulesCollection.updateOne(
            { userId: userId }, // Find the user's schedule document
            { $set: { "tasks.$[elem].isCompleted": isCompleted } }, // Set the isCompleted field
            { arrayFilters: [{ "elem.taskId": taskId }] } // Filter condition for the element
        );

        if (result.matchedCount === 0) {
             console.log("update-task: No schedule found for user:", userId);
            return NextResponse.json({ message: 'Schedule not found for user.' }, { status: 404 });
        }
        if (result.modifiedCount === 0) {
            // This could mean the task wasn't found OR the status was already set to the new value
            console.log("update-task: Task not found or status unchanged for taskId:", taskId, "User:", userId);
             // Check if task actually exists to differentiate
             const check = await schedulesCollection.findOne({ userId: userId, "tasks.taskId": taskId });
             if (!check) {
                 return NextResponse.json({ message: 'Task not found.' }, { status: 404 });
             }
             // If task exists, it means status was already correct, so return success
        } else {
             console.log("update-task: Task updated successfully for taskId:", taskId, "User:", userId, "New status:", isCompleted);
        }

        return NextResponse.json({ message: 'Task updated successfully.' }, { status: 200 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Error in /api/update-task:', error);
        return NextResponse.json({ message: error.message || 'Internal server error.' }, { status: 500 });
    }
}