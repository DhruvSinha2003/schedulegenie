// app/api/get-schedule/route.ts
import clientPromise from '@/lib/mongodb';
import { getSession } from '@auth0/nextjs-auth0'; // Updated import
import { NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";
const USERS_COLLECTION = "users";

export async function GET() {
    try {
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.sub;

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
        } catch (userDbError) {
            console.error("Error upserting user during get-schedule:", userDbError);
            // Log and continue
        }

        // Fetch the single schedule document for the user
        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const schedulesCollection = db.collection(SCHEDULES_COLLECTION);

        const userSchedule = await schedulesCollection.findOne({ userId: userId });

        if (!userSchedule || !userSchedule.tasks || !Array.isArray(userSchedule.tasks)) {
            // No schedule found or tasks array missing/invalid
            return NextResponse.json({ tasks: [], notes: "No schedule generated yet." }, { status: 200 }); // Return empty tasks array
        }

        // Return the tasks array and any potential notes
        return NextResponse.json(
            {
                tasks: userSchedule.tasks,
                notes: userSchedule.notes || null
            },
            { status: 200 }
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Error in /api/get-schedule:', error);
        return NextResponse.json({ message: error.message || 'Internal server error while fetching schedule.' }, { status: 500 });
    }
}