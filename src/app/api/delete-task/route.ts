// app/api/delete-task/route.ts
import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0/edge';
import { NextRequest, NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        
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

        // Fix the $pull operator typing
        const result = await schedulesCollection.updateOne(
            { userId: userId },
            // @ts-expect-error - MongoDB typing issue with $pull
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

        return NextResponse.json({ message: 'Task deleted successfully.' }, { status: 200 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Error in /api/delete-task:', error);
        return NextResponse.json({ message: error.message || 'Internal server error.' }, { status: 500 });
    }
}