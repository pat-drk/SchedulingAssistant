/**
 * Responsive breakpoint constants for the application
 * Used consistently across all components for mobile-responsive design
 */

export const BREAKPOINTS = {
  /** Mobile devices: viewport width < 768px */
  mobile: {
    max: 767,
    maxQuery: "(max-width: 767px)",
  },
  /** Tablet devices: viewport width 768px - 1023px */
  tablet: {
    min: 768,
    max: 1023,
    query: "(min-width: 768px) and (max-width: 1023px)",
  },
  /** Desktop devices: viewport width >= 1024px */
  desktop: {
    min: 1024,
    minQuery: "(min-width: 1024px)",
  },
} as const;

/**
 * Mobile bottom navigation height
 * Used for both the bottom nav component and shell padding
 */
export const MOBILE_NAV_HEIGHT = "60px";
