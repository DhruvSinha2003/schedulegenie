// src/app/api/export-schedule/route.ts
import { formatForICS, parseTaskDateTime } from '@/lib/dateUtils';
import clientPromise from '@/lib/mongodb';
import { Task } from '@/types/task';
import { getSession } from '@auth0/nextjs-auth0';
import * as ics from 'ics';
import { NextRequest, NextResponse } from 'next/server'; // Import NextRequest

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";

// Add req: NextRequest parameter
export async function GET(req: NextRequest) {
    try {
        const res = new NextResponse(); // Create res
        const session = await getSession(req, res); // Pass req, res

        if (!session || !session.user) {
            // Returning JSON error for API consistency, though redirect might also work
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;

        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const schedulesCollection = db.collection(SCHEDULES_COLLECTION);
        const userSchedule = await schedulesCollection.findOne({ userId: userId });

        if (!userSchedule || !userSchedule.tasks || !Array.isArray(userSchedule.tasks) || userSchedule.tasks.length === 0) {
            return NextResponse.json({ message: 'No schedule found or schedule is empty.' }, { status: 404, headers: res.headers }); // Pass headers
        }

        const events: ics.EventAttributes[] = [];
        const referenceDate = new Date();

        userSchedule.tasks.forEach((task: Task) => {
            const { start, end } = parseTaskDateTime(task, referenceDate);

            if (start && end) {
                const startArr = formatForICS(start);
                const endArr = formatForICS(end);

                if (startArr && endArr) {
                    events.push({
                        title: task.content,
                        start: startArr as [number, number, number, number, number], // Type assertion for ics library
                        end: endArr as [number, number, number, number, number],   // Type assertion for ics library
                        description: task.notes || undefined,
                        uid: task.taskId,
                    });
                } else {
                    console.warn(`Skipping task for ICS export due to formatting issue: ${task.taskId}`);
                }
            } else {
                console.warn(`Skipping task for ICS export due to parsing issue: ${task.taskId} (Day: ${task.day}, Time: ${task.time})`);
            }
        });

        if (events.length === 0) {
             return NextResponse.json({ message: 'Could not parse any tasks into valid calendar events.' }, { status: 400, headers: res.headers }); // Pass headers
        }

        const { error, value } = ics.createEvents(events);

        if (error) {
            console.error("Error creating ICS file:", error);
            throw error; // Let catch block handle
        }

        if (!value) {
            // Ensure value exists before proceeding
            return NextResponse.json({ message: 'Failed to generate ICS data.' }, { status: 500, headers: res.headers }); // Pass headers
        }

        // Combine Auth0 headers with ICS headers
        const combinedHeaders = new Headers(res.headers); // Initialize with headers from Auth0 session handling
        combinedHeaders.set('Content-Type', 'text/calendar; charset=utf-8');
        combinedHeaders.set('Content-Disposition', 'attachment; filename="schedule.ics"');

        // Create the final response with the ICS value and combined headers
        return new NextResponse(value, {
            status: 200,
            headers: combinedHeaders, // Use combined headers
        });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Error in /api/export-schedule:', error);
        return NextResponse.json({ message: error.message || 'Internal server error generating schedule export.' }, { status: 500 });
    }
}