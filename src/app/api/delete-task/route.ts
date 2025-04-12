// app/api/delete-task/route.ts
import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0';
import { cookies } from 'next/headers'; // Import cookies
import { NextRequest, NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";

export async function DELETE(req: NextRequest) {
    let session;
    try {
        const cookieStore = cookies(); // Get cookies
        session = await getSession({ cookieStore }); // Pass to getSession
        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;

        const url = new URL(req.url);
        const taskId = url.searchParams.get('taskId');

        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json({ message: 'Missing or invalid taskId in query parameter.' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const schedulesCollection = db.collection(SCHEDULES_COLLECTION);

        const result = await schedulesCollection.updateOne(
            { userId: userId },
            { $pull: { tasks: { taskId: taskId } } }
        );

        if (result.matchedCount === 0) {
            // No schedule found for user, which is also a form of 'not found' for the task
            return NextResponse.json({ message: 'Schedule not found or task does not exist.' }, { status: 404 });
        }
        if (result.modifiedCount === 0) {
            // Task ID didn't exist in the array
            return NextResponse.json({ message: 'Task not found or already deleted.' }, { status: 404 });
        }

        // console.log("delete-task: Task deleted successfully for taskId:", taskId, "User:", userId);
        return NextResponse.json({ message: 'Task deleted successfully.' }, { status: 200 });

    } catch (error: any) {
        console.error('Error in /api/delete-task:', error);
        return NextResponse.json({ message: error.message || 'Internal server error.' }, { status: 500 });
    }
}