import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0';
import { NextRequest, NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";
const USERS_COLLECTION = "users";

export async function GET(req: NextRequest) {
    try {
        // In App Router, getSession() doesn't need arguments
        const session = await getSession();
        
        if (!session || !session.user) {
            console.log("get-schedule: Unauthorized access attempt.");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        
        const userId = session.user.sub;
        console.log("get-schedule: Authorized access for user:", userId);

        // Optional: Upsert user data on fetch as well (ensures user exists on first load)
        try {
            const client = await clientPromise;
            const db = client.db(DB_NAME);
            const usersCollection = db.collection(USERS_COLLECTION);
            await usersCollection.updateOne(
                { userId: userId },
                {
                    $set: {
                        email: session.user.email,
                        name: session.user.name,
                        picture: session.user.picture,
                        lastLogin: new Date()
                    },
                    $setOnInsert: { userId: userId, createdAt: new Date() }
                },
                { upsert: true }
            );
        } catch (userDbError) {
            console.error("Error upserting user during get-schedule:", userDbError);
            // Log and continue, fetching schedule is primary goal
        }

        // Fetch the single schedule document for the user
        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const schedulesCollection = db.collection(SCHEDULES_COLLECTION);

        console.log("get-schedule: Fetching schedule for user:", userId);
        const userSchedule = await schedulesCollection.findOne({ userId: userId });

        if (!userSchedule || !userSchedule.tasks || !Array.isArray(userSchedule.tasks)) {
            console.log("get-schedule: No schedule document or tasks array found for user:", userId);
            // No schedule found for this user yet
            return NextResponse.json({ tasks: [], notes: "No schedule generated yet." }, { status: 200 }); // Return empty tasks array
        }

        console.log("get-schedule: Schedule found, returning", userSchedule.tasks.length, "tasks for user:", userId);
        // Return the tasks array and any potential notes
        return NextResponse.json(
            {
                tasks: userSchedule.tasks,
                notes: userSchedule.notes || null
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('Error in /api/get-schedule:', error);
        return NextResponse.json({ message: error.message || 'Internal server error while fetching schedule.' }, { status: 500 });
    }
}