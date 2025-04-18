// app/api/chat-status/route.ts
import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0';
import { NextRequest, NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const USERS_COLLECTION = "users";
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MINUTES = 10;

export async function GET(req: NextRequest) {
    try {
        // Updated session handling
        const res = new NextResponse();
        const session = await getSession(req, res);
        
        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;

        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const usersCollection = db.collection(USERS_COLLECTION);

        const user = await usersCollection.findOne({ userId: userId }, { projection: { chatRequestTimestamps: 1 } });

        const timestamps = user?.chatRequestTimestamps || [];
        const windowStart = Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recentRequests = timestamps.filter((ts: any) => new Date(ts).getTime() >= windowStart);
        const remaining = Math.max(0, RATE_LIMIT_COUNT - recentRequests.length);

        return NextResponse.json({
            remaining: remaining,
            limit: RATE_LIMIT_COUNT,
            windowMinutes: RATE_LIMIT_WINDOW_MINUTES
        }, { status: 200 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Error in /api/chat-status:', error);
        return NextResponse.json({ message: error.message || 'Internal server error.' }, { status: 500 });
    }
}