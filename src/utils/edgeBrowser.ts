/**
 * Edge Browser Detection Utility
 * Provides functions to detect Microsoft Edge browser and helper functions for Copilot features
 */

/**
 * Detects if the current browser is Microsoft Edge
 * @returns true if running in Microsoft Edge, false otherwise
 */
export function isEdgeBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Check for Edge Chromium (Edg/ in user agent)
  // Note: Old Edge (EdgeHTML) used "Edge/" but modern Edge uses "Edg/"
  return userAgent.includes('edg/') || userAgent.includes('edge/');
}

/**
 * Gets the appropriate keyboard shortcut for opening Copilot based on the OS
 * @returns The keyboard shortcut string
 */
export function getCopilotShortcut(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Ctrl + Shift + .';
  }
  
  const isMac = /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
  return isMac ? 'Cmd + Shift + .' : 'Ctrl + Shift + .';
}

/**
 * Gets the keyboard shortcut in a format suitable for display with proper symbols
 * @returns The formatted keyboard shortcut string
 */
export function getFormattedCopilotShortcut(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Ctrl + Shift + .';
  }
  
  const isMac = /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
  return isMac ? '⌘ + Shift + .' : 'Ctrl + Shift + .';
}
