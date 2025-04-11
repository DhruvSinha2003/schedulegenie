import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0';
import { NextRequest, NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";

export async function DELETE(req: NextRequest) { // Use DELETE method
    let session;
    try {
        session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;

        // Get taskId from query parameters instead of body for DELETE
        const url = new URL(req.url);
        const taskId = url.searchParams.get('taskId');

        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json({ message: 'Missing or invalid taskId in query parameter.' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const schedulesCollection = db.collection(SCHEDULES_COLLECTION);

        // Use $pull to remove the element matching the taskId from the tasks array
        const result = await schedulesCollection.updateOne(
            { userId: userId }, // Find the user's schedule document
            { $pull: { tasks: { taskId: taskId } } } // Remove the task object with matching taskId
        );

        if (result.matchedCount === 0) {
             console.log("delete-task: No schedule found for user:", userId);
            return NextResponse.json({ message: 'Schedule not found.' }, { status: 404 });
        }
        if (result.modifiedCount === 0) {
             console.log("delete-task: Task not found with taskId:", taskId, "for user:", userId);
            // Task might have already been deleted
            return NextResponse.json({ message: 'Task not found or already deleted.' }, { status: 404 });
        }

        console.log("delete-task: Task deleted successfully for taskId:", taskId, "User:", userId);
        return NextResponse.json({ message: 'Task deleted successfully.' }, { status: 200 });

    } catch (error: any) {
        console.error('Error in /api/delete-task:', error);
        return NextResponse.json({ message: error.message || 'Internal server error.' }, { status: 500 });
    }
}