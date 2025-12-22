/**
 * Shared constants for training-related calculations
 */

// Approximate durations in milliseconds
export const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
export const TWO_MONTHS_MS = 2 * 30 * 24 * 60 * 60 * 1000;

// Required training areas that all trainees must experience
export const REQUIRED_TRAINING_AREAS = [
  "Dining Room",
  "Machine Room",
  "Veggie Room",
  "Receiving",
] as const;

export type RequiredArea = typeof REQUIRED_TRAINING_AREAS[number];

/**
 * Check if a person is currently in their training period (first 6 months)
 */
export function isInTrainingPeriod(startDate: Date, endDate: Date | null, now: Date = new Date()): boolean {
  const sixMonthsAfterStart = new Date(startDate.getTime() + SIX_MONTHS_MS);
  return now < sixMonthsAfterStart && (!endDate || now < endDate);
}

/**
 * Calculate weeks remaining in training period
 */
export function weeksRemainingInTraining(startDate: Date, now: Date = new Date()): number {
  const sixMonthsAfterStart = new Date(startDate.getTime() + SIX_MONTHS_MS);
  const timeRemaining = sixMonthsAfterStart.getTime() - now.getTime();
  return Math.max(0, Math.ceil(timeRemaining / (7 * 24 * 60 * 60 * 1000)));
}
