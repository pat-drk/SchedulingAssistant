import type { SegmentRow } from './segments';

export interface DepartmentEvent {
  id: number;
  title: string;
  date: string;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  group_id: number | null;
  role_id: number | null;
  description: string | null;
}

export interface AdjustedSegment {
  id: number;
  name: string;
  original_start: string;
  original_end: string;
  adjusted_start: string;
  adjusted_end: string;
  ordering: number;
  is_split: boolean;
  split_part?: 'before' | 'after';
  blocked: boolean; // fully covered by event
}

/**
 * Get department events for a specific date
 */
export function getEventsForDate(all: (sql: string, params?: any[], db?: any) => any[], date: string): DepartmentEvent[] {
  const rows = all(
    `SELECT id, title, date, start_time, end_time, group_id, role_id, description
     FROM department_event
     WHERE date = ?
     ORDER BY start_time`,
    [date]
  );

  // rows are returned as objects from the `all` helper (getAsObject())
  return rows.map((row: any) => ({
    id: Number(row.id),
    title: String(row.title),
    date: String(row.date),
    start_time: String(row.start_time),
    end_time: String(row.end_time),
    group_id: row.group_id != null ? Number(row.group_id) : null,
    role_id: row.role_id != null ? Number(row.role_id) : null,
    description: row.description != null ? String(row.description) : null,
  }));
}

/**
 * Convert HH:MM to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Convert minutes since midnight to HH:MM
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Check if two time ranges overlap
 */
function rangesOverlap(
  start1: number, end1: number,
  start2: number, end2: number
): boolean {
  return start1 < end2 && start2 < end1;
}

/**
 * Adjust segment times around department events for a specific date.
 * Returns adjusted segment info with potentially split segments.
 */
export function getAdjustedSegments(
  segments: SegmentRow[],
  events: DepartmentEvent[]
): AdjustedSegment[] {
  if (events.length === 0) {
    // No events, return segments unchanged
    return segments.map((seg) => ({
      id: seg.id,
      name: seg.name,
      original_start: seg.start_time,
      original_end: seg.end_time,
      adjusted_start: seg.start_time,
      adjusted_end: seg.end_time,
      ordering: seg.ordering,
      is_split: false,
      blocked: false,
    }));
  }

  const result: AdjustedSegment[] = [];

  for (const seg of segments) {
    let segStart = timeToMinutes(seg.start_time);
    let segEnd = timeToMinutes(seg.end_time);
    const originalStart = seg.start_time;
    const originalEnd = seg.end_time;

    // Track remaining time ranges after all events carve out their times
    let ranges: Array<{ start: number; end: number }> = [{ start: segStart, end: segEnd }];

    for (const event of events) {
      const eventStart = timeToMinutes(event.start_time);
      const eventEnd = timeToMinutes(event.end_time);

      const newRanges: Array<{ start: number; end: number }> = [];

      for (const range of ranges) {
        if (!rangesOverlap(range.start, range.end, eventStart, eventEnd)) {
          // No overlap, keep range as-is
          newRanges.push(range);
        } else {
          // Event overlaps this range - split or shorten
          // Part before event
          if (range.start < eventStart) {
            newRanges.push({ start: range.start, end: eventStart });
          }
          // Part after event
          if (range.end > eventEnd) {
            newRanges.push({ start: eventEnd, end: range.end });
          }
          // If event fully covers the range, nothing is added
        }
      }

      ranges = newRanges;
    }

    if (ranges.length === 0) {
      // Segment fully blocked by events
      result.push({
        id: seg.id,
        name: seg.name,
        original_start: originalStart,
        original_end: originalEnd,
        adjusted_start: originalStart,
        adjusted_end: originalEnd,
        ordering: seg.ordering,
        is_split: false,
        blocked: true,
      });
    } else if (ranges.length === 1) {
      // Single range remaining (shortened or unchanged)
      const r = ranges[0];
      result.push({
        id: seg.id,
        name: seg.name,
        original_start: originalStart,
        original_end: originalEnd,
        adjusted_start: minutesToTime(r.start),
        adjusted_end: minutesToTime(r.end),
        ordering: seg.ordering,
        is_split: false,
        blocked: false,
      });
    } else {
      // Multiple ranges - segment is split
      ranges.sort((a, b) => a.start - b.start);
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        result.push({
          id: seg.id,
          name: seg.name,
          original_start: originalStart,
          original_end: originalEnd,
          adjusted_start: minutesToTime(r.start),
          adjusted_end: minutesToTime(r.end),
          ordering: seg.ordering + i * 0.1, // Slightly adjust ordering for splits
          is_split: true,
          split_part: i === 0 ? 'before' : 'after',
          blocked: false,
        });
      }
    }
  }

  // Sort by adjusted ordering
  result.sort((a, b) => a.ordering - b.ordering);

  return result;
}

/**
 * Format time for display (12-hour format)
 */
export function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}
