// lib/dateUtils.ts
import { Task } from '@/types/task'; // Assuming your Task type is here
import {
    addDays,
    addHours, // More robust parsing
    format, // For YYYY-MM-DD
    getDay,
    isMatch, // To check format validity
    isValid,
    parse, // To check overall validity
    parseISO,
    startOfWeek,
} from 'date-fns';

interface ParsedTimeResult {
    start: Date | null;
    end: Date | null;
}

/**
 * Attempts to parse the day string (YYYY-MM-DD, day name, relative terms)
 * into a specific Date object.
 * @param dayStr The string representing the day from the task.
 * @param referenceDate The date to calculate relative terms from (usually Date.now()).
 * @returns A Date object or null if parsing fails.
 */
function parseDayString(dayStr: string, referenceDate: Date): Date | null {
    dayStr = dayStr.trim();
    const today = referenceDate;

    // 1. Check for YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayStr) && isMatch(dayStr, 'yyyy-MM-dd')) {
        const parsed = parseISO(dayStr);
        if (isValid(parsed)) {
            return parsed;
        }
    }

     // 2. Check for relative terms
    const lowerDayStr = dayStr.toLowerCase();
    if (lowerDayStr === 'today') {
        return today;
    }
    if (lowerDayStr === 'tomorrow') {
        return addDays(today, 1);
    }

    // 3. Check for day names (Monday, Tuesday, etc.)
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayIndex = dayNames.indexOf(lowerDayStr);

    if (dayIndex !== -1) {
        const todayIndex = getDay(today); // 0 for Sunday, 1 for Monday...
        let daysToAdd = dayIndex - todayIndex;
        if (daysToAdd <= 0) { // If it's today or a past day of the week, find the *next* one
            daysToAdd += 7;
        }
        return addDays(today, daysToAdd);
    }

    // 4. Fallback: Try general parsing (less reliable for dates without years)
    try {
        // Attempt to parse with a common format, assuming current year if missing
        const parsed = parse(dayStr, 'MMMM d', referenceDate);
        if (isValid(parsed)) return parsed;
        const parsed2 = parse(dayStr, 'MMM d', referenceDate);
        if (isValid(parsed2)) return parsed2;
    } catch (e) { /* Ignore parsing errors */ }


    console.warn(`Could not parse day string: "${dayStr}"`);
    return null; // Could not determine date
}

/**
 * Attempts to parse the time string (e.g., "9:00 AM", "1:30 PM - 3:00 PM")
 * and combines it with a specific date.
 * @param timeStr The string representing the time from the task.
 * @param date The specific Date object representing the day.
 * @returns An object with start and end Date objects, or nulls if parsing fails.
 */
function parseTimeString(timeStr: string | null | undefined, date: Date): ParsedTimeResult {
    if (!timeStr || !date || !isValid(date)) {
        return { start: null, end: null };
    }

    timeStr = timeStr.trim();
    const timeRegex = /(\d{1,2}:\d{2})\s*(?:(AM|PM))?/i; // Matches HH:MM and optional AM/PM

    // Check for time range format "HH:MM AM/PM - HH:MM AM/PM"
    const rangeMatch = timeStr.match(/^(.+?)\s*-\s*(.+)$/);
    if (rangeMatch) {
        const startTimeStr = rangeMatch[1].trim();
        const endTimeStr = rangeMatch[2].trim();

        const startDetails = parseSingleTime(startTimeStr, date);
        const endDetails = parseSingleTime(endTimeStr, date);

        // Basic validation: ensure end is after start
        if (startDetails.start && endDetails.start && endDetails.start > startDetails.start) {
             return { start: startDetails.start, end: endDetails.start };
        } else if (startDetails.start) {
            // If end parse fails or is invalid, default to 1 hour duration from start
            return { start: startDetails.start, end: addHours(startDetails.start, 1)};
        }
    }

    // Check for single time format "HH:MM AM/PM" or just "HH:MM"
    const singleTimeDetails = parseSingleTime(timeStr, date);
    if (singleTimeDetails.start) {
         // Default to 1 hour duration if only start time is found
         return { start: singleTimeDetails.start, end: addHours(singleTimeDetails.start, 1)};
    }

    console.warn(`Could not parse time string: "${timeStr}"`);
    return { start: null, end: null }; // Failed to parse
}

// Helper to parse a single time part (e.g., "9:00 AM" or "14:30")
function parseSingleTime(timePart: string, date: Date): ParsedTimeResult {
     // Try formats like 'h:mm a' (1:30 PM), 'h a' (1PM), 'HH:mm' (13:30)
     const formats = ['h:mm a', 'ha', 'HH:mm', 'h:mm', 'H:mm'];
     for (const fmt of formats) {
         try {
             // Note: date-fns parse sets the date parts too, so we need to reset them
             const parsedTime = parse(timePart, fmt, new Date()); // Parse against a dummy date first
             if (isValid(parsedTime)) {
                 const finalDate = new Date(date); // Clone the original date
                 finalDate.setHours(parsedTime.getHours());
                 finalDate.setMinutes(parsedTime.getMinutes());
                 finalDate.setSeconds(0);
                 finalDate.setMilliseconds(0);
                 if (isValid(finalDate)) {
                     return { start: finalDate, end: null }; // Return only start for single time
                 }
             }
         } catch (e) { /* continue trying other formats */ }
     }
     return { start: null, end: null };
}


/**
 * Main utility function to parse task day and time.
 * @param task The task object.
 * @param referenceDate The date to use for relative calculations.
 * @returns Object with start and end Date objects or nulls.
 */
export function parseTaskDateTime(task: Task, referenceDate: Date = new Date()): ParsedTimeResult {
    const specificDate = parseDayString(task.day, referenceDate);

    if (!specificDate) {
        return { start: null, end: null };
    }

    return parseTimeString(task.time, specificDate);
}

/**
 * Formats Date objects into the Google Calendar link format (YYYYMMDDTHHMMSS).
 * Uses local time as Google Calendar handles timezone interpretation.
 * @param date The Date object.
 * @returns Formatted string or empty string if date is invalid.
 */
export function formatForGoogleCalendar(date: Date | null): string {
    if (!date || !isValid(date)) return '';
    // Format: YYYYMMDDTHHMMSS (local time)
    return format(date, "yyyyMMdd'T'HHmmss");
}

/**
 * Formats Date objects into the UTC array format required by the 'ics' library.
 * [year, month, day, hour, minute]
 * @param date The Date object.
 * @returns Array or null if date is invalid.
 */
export function formatForICS(date: Date | null): number[] | null {
     if (!date || !isValid(date)) return null;
     return [
         date.getUTCFullYear(),
         date.getUTCMonth() + 1, // Month is 1-indexed for ics
         date.getUTCDate(),
         date.getUTCHours(),
         date.getUTCMinutes()
     ];
}