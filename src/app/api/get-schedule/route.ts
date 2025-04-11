// app/api/get-schedule/route.ts
import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0';
import { NextRequest, NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";
const USERS_COLLECTION = "users"; // Keep user upsert for robustness

export async function GET(req: NextRequest) {
    let session;
    try {
        session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;

        // Optional: Upsert user data
        try {
            const client = await clientPromise;
            const db = client.db(DB_NAME);
            await db.collection(USERS_COLLECTION).updateOne(
                { userId: userId },
                { $set: { email: session.user.email, name: session.user.name, picture: session.user.picture, lastLogin: new Date() }, $setOnInsert: { userId: userId, createdAt: new Date() } },
                { upsert: true }
            );
        } catch (userDbError) {
            console.error("Error upserting user during get-schedule:", userDbError);
        }

        // Fetch the single schedule document for the user
        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const schedulesCollection = db.collection(SCHEDULES_COLLECTION);

        const userSchedule = await schedulesCollection.findOne({ userId: userId });

        if (!userSchedule || !userSchedule.tasks) {
            // No schedule document or no tasks array found for this user yet
            return NextResponse.json({ tasks: [], notes: "No schedule found." }, { status: 200 });
        }

        // Return the tasks array and any potential notes
        return NextResponse.json({ tasks: userSchedule.tasks, notes: userSchedule.notes || null }, { status: 200 });

    } catch (error: any) {
        console.error('Error in /api/get-schedule:', error);
        return NextResponse.json({ message: error.message || 'Internal server error.' }, { status: 500 });
    }
}