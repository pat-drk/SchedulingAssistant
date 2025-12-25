/**
 * Utility functions for calculating week numbers within a month.
 * Supports two modes:
 * - "first_monday": Week 1 starts on the first Monday of the month
 * - "first_day": Week 1 starts on the 1st of the month
 */

export type WeekStartMode = "first_monday" | "first_day";

/**
 * Get the first Monday of a given month.
 * @param year The year (e.g., 2024)
 * @param month The month (1-12)
 * @returns The date of the first Monday, or null if there's no Monday in the month
 */
export function getFirstMondayOfMonth(year: number, month: number): Date | null {
  const firstDay = new Date(year, month - 1, 1);
  const dayOfWeek = firstDay.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  
  let daysUntilMonday: number;
  if (dayOfWeek === 0) {
    // Sunday - Monday is 1 day away
    daysUntilMonday = 1;
  } else if (dayOfWeek === 1) {
    // Already Monday
    daysUntilMonday = 0;
  } else {
    // Tuesday-Saturday - calculate days until next Monday
    daysUntilMonday = 8 - dayOfWeek;
  }
  
  const firstMonday = new Date(year, month - 1, 1 + daysUntilMonday);
  
  // Check if the first Monday is still within the same month
  if (firstMonday.getMonth() !== month - 1) {
    return null;
  }
  
  return firstMonday;
}

/**
 * Calculate the week number of the month for a given date.
 * @param date The date to calculate the week for
 * @param mode The week calculation mode
 * @returns Week number (1-5) or 0 if the day is before the first Monday in "first_monday" mode
 */
export function getWeekOfMonth(date: Date, mode: WeekStartMode): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const dayOfMonth = date.getDate();
  
  if (mode === "first_day") {
    // Traditional mode: Week 1 starts on day 1
    // Calculate which week this day falls into
    return Math.floor((dayOfMonth - 1) / 7) + 1;
  } else {
    // First Monday mode: Week 1 starts on the first Monday
    const firstMonday = getFirstMondayOfMonth(year, month);
    
    if (!firstMonday) {
      // No Monday in this month (very rare edge case)
      return 0;
    }
    
    const firstMondayDate = firstMonday.getDate();
    
    if (dayOfMonth < firstMondayDate) {
      // Before the first Monday - no week number
      return 0;
    }
    
    // Calculate days since first Monday
    const daysSinceFirstMonday = dayOfMonth - firstMondayDate;
    
    // Calculate week number (1-based)
    return Math.floor(daysSinceFirstMonday / 7) + 1;
  }
}

/**
 * Get the date range for a specific week number in a month.
 * Useful for displaying which dates are covered by each week.
 * @param year The year
 * @param month The month (1-12)
 * @param weekNumber The week number (1-5)
 * @param mode The week calculation mode
 * @returns Object with start and end dates, or null if invalid
 */
export function getWeekDateRange(
  year: number,
  month: number,
  weekNumber: number,
  mode: WeekStartMode
): { start: Date; end: Date } | null {
  if (weekNumber < 1 || weekNumber > 5) {
    return null;
  }
  
  let weekStartDay: number;
  
  if (mode === "first_day") {
    // Week 1 starts on day 1, Week 2 on day 8, etc.
    weekStartDay = (weekNumber - 1) * 7 + 1;
  } else {
    // First Monday mode
    const firstMonday = getFirstMondayOfMonth(year, month);
    if (!firstMonday) {
      return null;
    }
    weekStartDay = firstMonday.getDate() + (weekNumber - 1) * 7;
  }
  
  const startDate = new Date(year, month - 1, weekStartDay);
  
  // Check if start date is still in the same month
  if (startDate.getMonth() !== month - 1) {
    return null;
  }
  
  // End date is 6 days later (a full week)
  const endDate = new Date(year, month - 1, weekStartDay + 6);
  
  // If end date goes into next month, cap it at the last day of the current month
  if (endDate.getMonth() !== month - 1) {
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    return {
      start: startDate,
      end: new Date(year, month - 1, lastDayOfMonth)
    };
  }
  
  return { start: startDate, end: endDate };
}

/**
 * Format a date range as a readable string.
 * @param start Start date
 * @param end End date
 * @returns Formatted string like "Dec 4-10" or "Dec 4-31"
 */
export function formatDateRange(start: Date, end: Date): string {
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  
  const month = monthNames[start.getMonth()];
  const startDay = start.getDate();
  const endDay = end.getDate();
  
  return `${month} ${startDay}-${endDay}`;
}

/**
 * Get the effective month for a given date based on week start mode.
 * In "first_monday" mode, dates before the first Monday belong to the prior month.
 * In "first_day" mode, uses the calendar month.
 * @param date The date to check
 * @param mode The week calculation mode
 * @returns Month in YYYY-MM format
 */
export function getEffectiveMonth(date: Date, mode: WeekStartMode): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  
  if (mode === "first_day") {
    // Use calendar month
    const monthStr = month.toString().padStart(2, '0');
    return `${year}-${monthStr}`;
  } else {
    // first_monday mode: check if date is before first Monday
    const firstMonday = getFirstMondayOfMonth(year, month);
    
    if (!firstMonday || date < firstMonday) {
      // Date is before the first Monday - belongs to prior month
      const priorDate = new Date(year, month - 2, 1); // Go to previous month
      const priorYear = priorDate.getFullYear();
      const priorMonth = priorDate.getMonth() + 1;
      const priorMonthStr = priorMonth.toString().padStart(2, '0');
      return `${priorYear}-${priorMonthStr}`;
    }
    
    // Date is on or after first Monday - use current month
    const monthStr = month.toString().padStart(2, '0');
    return `${year}-${monthStr}`;
  }
}
