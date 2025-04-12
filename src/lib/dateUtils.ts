import { Task } from '@/types/task';
import {
    addDays,
    addHours,
    format,
    getDay,
    isMatch,
    isValid,
    parse,
    parseISO,
} from 'date-fns';

interface ParsedTimeResult {
  start: Date | null;
  end: Date | null;
}

function parseDayString(dayStr: string, referenceDate: Date): Date | null {
  dayStr = dayStr.trim();
  const today = referenceDate;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dayStr) && isMatch(dayStr, 'yyyy-MM-dd')) {
    const parsed = parseISO(dayStr);
    if (isValid(parsed)) {
      return parsed;
    }
  }

  const lowerDayStr = dayStr.toLowerCase();
  if (lowerDayStr === 'today') {
    return today;
  }
  if (lowerDayStr === 'tomorrow') {
    return addDays(today, 1);
  }

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = dayNames.indexOf(lowerDayStr);

  if (dayIndex !== -1) {
    const todayIndex = getDay(today);
    let daysToAdd = dayIndex - todayIndex;
    if (daysToAdd <= 0) {
      daysToAdd += 7;
    }
    return addDays(today, daysToAdd);
  }

  const parsed = parse(dayStr, 'MMMM d', referenceDate);
  if (isValid(parsed)) return parsed;
  const parsed2 = parse(dayStr, 'MMM d', referenceDate);
  if (isValid(parsed2)) return parsed2;

  console.warn(`Could not parse day string: "${dayStr}"`);
  return null;
}

function parseTimeString(timeStr: string | null | undefined, date: Date): ParsedTimeResult {
  if (!timeStr || !date || !isValid(date)) {
    return { start: null, end: null };
  }

  timeStr = timeStr.trim();

  const rangeMatch = timeStr.match(/^(.+?)\s*-\s*(.+)$/);
  if (rangeMatch) {
    const startTimeStr = rangeMatch[1].trim();
    const endTimeStr = rangeMatch[2].trim();

    const startDetails = parseSingleTime(startTimeStr, date);
    const endDetails = parseSingleTime(endTimeStr, date);

    if (startDetails.start && endDetails.start && endDetails.start > startDetails.start) {
      return { start: startDetails.start, end: endDetails.start };
    } else if (startDetails.start) {
      return { start: startDetails.start, end: addHours(startDetails.start, 1) };
    }
  }

  const singleTimeDetails = parseSingleTime(timeStr, date);
  if (singleTimeDetails.start) {
    return { start: singleTimeDetails.start, end: addHours(singleTimeDetails.start, 1) };
  }

  console.warn(`Could not parse time string: "${timeStr}"`);
  return { start: null, end: null };
}

function parseSingleTime(timePart: string, date: Date): ParsedTimeResult {
  const formats = ['h:mm a', 'ha', 'HH:mm', 'h:mm', 'H:mm'];
  for (const fmt of formats) {
    const parsedTime = parse(timePart, fmt, new Date());
    if (isValid(parsedTime)) {
      const finalDate = new Date(date);
      finalDate.setHours(parsedTime.getHours());
      finalDate.setMinutes(parsedTime.getMinutes());
      finalDate.setSeconds(0);
      finalDate.setMilliseconds(0);
      if (isValid(finalDate)) {
        return { start: finalDate, end: null };
      }
    }
  }
  return { start: null, end: null };
}

export function parseTaskDateTime(task: Task, referenceDate: Date = new Date()): ParsedTimeResult {
  const specificDate = parseDayString(task.day, referenceDate);

  if (!specificDate) {
    return { start: null, end: null };
  }

  return parseTimeString(task.time, specificDate);
}

export function formatForGoogleCalendar(date: Date | null): string {
  if (!date || !isValid(date)) return '';
  return format(date, "yyyyMMdd'T'HHmmss");
}

export function formatForICS(date: Date | null): number[] | null {
  if (!date || !isValid(date)) return null;
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ];
}
