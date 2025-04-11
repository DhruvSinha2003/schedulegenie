// app/api/get-schedule/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import clientPromise from '@/lib/mongodb'; // Ensure this path is correct relative to your project structure

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB"; // Use env var or default
const SCHEDULES_COLLECTION = "schedules";
const USERS_COLLECTION = "users";

export async function GET(req: NextRequest) {
    let session; // For potential error logging
    try {
        // 1. Check Authentication
        session = await getSession();
        if (!session || !session.user) {
            console.log("get-schedule: Unauthorized access attempt.");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;
        console.log("get-schedule: Authorized access for user:", userId);

        // Optional: Upsert user data on fetch as well
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
            // console.log("get-schedule: User upserted:", userId); // Optional log
        } catch (userDbError) {
            console.error("Error upserting user during get-schedule:", userDbError);
            // Log and continue
        }

        // 2. Fetch Latest Schedule
        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const schedulesCollection = db.collection(SCHEDULES_COLLECTION);

        console.log("get-schedule: Fetching latest schedule for user:", userId);
        const latestSchedule = await schedulesCollection.findOne(
            { userId: userId },
            { sort: { createdAt: -1 } } // Get the most recent one
        );

        if (!latestSchedule) {
            console.log("get-schedule: No schedule found for user:", userId);
            // Return an empty schedule array in the expected format
            return NextResponse.json({ schedule: [], notes: null }, { status: 200 });
        }

        console.log("get-schedule: Schedule found, returning data for user:", userId);
        // 3. Return the Schedule data in the { schedule: [...] } format
        return NextResponse.json(
            {
                schedule: latestSchedule.generatedSchedule || [], // Ensure schedule array exists
                notes: latestSchedule.notes || null
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('Error in /api/get-schedule:', error);
        // Log user ID if available
        if (session?.user?.sub) {
            console.error('Error occurred for user:', session.user.sub);
        }
        return NextResponse.json({ message: error.message || 'Internal server error.' }, { status: 500 });
    }
}