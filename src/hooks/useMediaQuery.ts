import { useState, useEffect } from "react";
import { BREAKPOINTS } from "../styles/breakpoints";

/**
 * Hook to detect media query breakpoints for responsive design
 * Breakpoints:
 * - Mobile: < 768px
 * - Tablet: 768px - 1023px
 * - Desktop: >= 1024px
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    // SSR-safe initialization
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/**
 * Convenience hooks for common breakpoints
 */
export function useIsMobile(): boolean {
  return useMediaQuery(BREAKPOINTS.mobile.maxQuery);
}

export function useIsTablet(): boolean {
  return useMediaQuery(BREAKPOINTS.tablet.query);
}

export function useIsDesktop(): boolean {
  return useMediaQuery(BREAKPOINTS.desktop.minQuery);
}

/**
 * Returns the current device type
 */
export function useDeviceType(): "mobile" | "tablet" | "desktop" {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  
  if (isMobile) return "mobile";
  if (isTablet) return "tablet";
  return "desktop";
}
