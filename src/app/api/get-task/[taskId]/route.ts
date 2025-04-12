import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0/edge';
import { NextRequest, NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";

interface Context {
    params: { taskId?: string };
}

export async function GET(req: NextRequest, context: Context) {
    try {
        // Get the session using the edge-compatible method
        const session = await getSession();
        
        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        
        const userId = session.user.sub;
        const taskId = context.params?.taskId;

        if (!taskId) {
            return NextResponse.json({ message: 'Task ID is required.' }, { status: 400 });
        }

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

        return NextResponse.json({ task }, { status: 200 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Error in /api/get-task:', error);
        return NextResponse.json({ message: error.message || 'Internal server error.' }, { status: 500 });
    }
}