// app/api/export-schedule/route.ts
import { formatForICS, parseTaskDateTime } from '@/lib/dateUtils';
import clientPromise from '@/lib/mongodb';
import { Task } from '@/types/task';
import { getSession } from '@auth0/nextjs-auth0/edge';
import * as ics from 'ics';
import { NextResponse } from 'next/server';

const DB_NAME = process.env.MONGODB_DB_NAME || "StudioGenieDB";
const SCHEDULES_COLLECTION = "schedules";

export async function GET() {
    try {
        const session = await getSession();
        
        if (!session || !session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.sub;

        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const schedulesCollection = db.collection(SCHEDULES_COLLECTION);
        const userSchedule = await schedulesCollection.findOne({ userId: userId });

        if (!userSchedule || !userSchedule.tasks || !Array.isArray(userSchedule.tasks) || userSchedule.tasks.length === 0) {
            return NextResponse.json({ message: 'No schedule found or schedule is empty.' }, { status: 404 });
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
                        start: startArr as [number, number, number, number, number],
                        end: endArr as [number, number, number, number, number],
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
            return NextResponse.json({ message: 'Could not parse any tasks into valid calendar events.' }, { status: 400 });
        }

        const { error, value } = ics.createEvents(events);

        if (error) {
            console.error("Error creating ICS file:", error);
            throw error;
        }

        if (!value) {
            return NextResponse.json({ message: 'Failed to generate ICS data.' }, { status: 500 });
        }

        return new NextResponse(value, {
            status: 200,
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': 'attachment; filename="schedule.ics"',
            },
        });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('Error in /api/export-schedule:', error);
        return NextResponse.json({ message: error.message || 'Internal server error generating schedule export.' }, { status: 500 });
    }
}