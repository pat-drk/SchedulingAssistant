# Edge Copilot Integration - Testing Guide

## Overview
This document provides guidance for testing the Microsoft Edge Copilot integration features.

## Components Added

### 1. Edge Browser Detection (`src/utils/edgeBrowser.ts`)
**Purpose**: Detects if the user is running Microsoft Edge and provides helper functions for Copilot features.

**Functions**:
- `isEdgeBrowser()`: Returns `true` if running in Edge
- `getCopilotShortcut()`: Returns platform-specific keyboard shortcut
- `getFormattedCopilotShortcut()`: Returns formatted shortcut with symbols

### 2. CopilotHelper Component (`src/components/CopilotHelper.tsx`)
**Purpose**: Shows an "AI Assistant" button that guides users to the Edge Copilot sidebar.

**Features**:
- Only visible in Microsoft Edge
- Displays as a primary button with Sparkle icon
- Shows popover with instructions when clicked
- Displays platform-specific keyboard shortcut

### 3. CopilotPromptMenu Component (`src/components/CopilotPromptMenu.tsx`)
**Purpose**: Provides pre-built prompts for common scheduling tasks.

**Features**:
- "AI Actions" dropdown menu
- 5 pre-built prompts for scheduling analysis
- Copies selected prompt to clipboard
- Shows toast notification on success
- Fallback to alert if clipboard fails

**Prompts**:
1. "Summarize this schedule"
2. "Analyze coverage gaps"
3. "Help me understand this view"
4. "Find scheduling conflicts"
5. "Suggest optimal assignments"

### 4. CopilotContext Component (`src/components/CopilotContext.tsx`)
**Purpose**: Provides hidden semantic content for Copilot to read and understand the app.

**Features**:
- Always rendered (works in all browsers)
- Visually hidden but readable by Copilot
- Contains dynamic app state
- Includes complete documentation content

**State Included**:
- Current view/tab name
- Selected date
- Active segment
- Number of people loaded
- Number of assignments
- Status messages
- Full application documentation

## Testing Instructions

### Test 1: Edge Browser Detection
1. Open the app in Microsoft Edge
   - **Expected**: "AI Assistant" and "AI Actions" buttons appear in top bar
2. Open the app in Chrome/Firefox/Safari
   - **Expected**: AI buttons do NOT appear

### Test 2: CopilotHelper Button
1. In Edge, click the "AI Assistant" button
   - **Expected**: Popover appears with instructions
   - **Expected**: Shows correct keyboard shortcut for your OS
   - **Expected**: Includes arrow pointing to sidebar
2. Click outside the popover
   - **Expected**: Popover closes

### Test 3: CopilotPromptMenu
1. In Edge, click the "AI Actions" button
   - **Expected**: Dropdown menu appears with 5 options
2. Click "Summarize this schedule"
   - **Expected**: Toast notification appears at bottom-right
   - **Expected**: Prompt is copied to clipboard
3. Paste the clipboard content
   - **Expected**: Full prompt text appears
4. Try each of the 5 prompts
   - **Expected**: All work correctly

### Test 4: CopilotContext
1. Open the app and press F12 to open DevTools
2. In Elements/Inspector, search for "copilot-context" or "app-state"
   - **Expected**: Hidden div with app state is present
3. Check the content includes:
   - Current tab name
   - Selected date
   - Active segment
   - People count
   - Full documentation text

### Test 5: Edge Copilot Integration
1. Open the app in Microsoft Edge
2. Press Ctrl+Shift+. (or Cmd+Shift+. on Mac)
   - **Expected**: Edge Copilot sidebar opens
3. In Copilot, type: "What is this app?"
   - **Expected**: Copilot responds with information about the scheduling app
4. Copy a prompt from "AI Actions" menu
5. Paste into Copilot
   - **Expected**: Copilot analyzes the page based on the prompt

### Test 6: Theme Support
1. In the app, toggle between light and dark theme
   - **Expected**: AI buttons and popovers match the theme
   - **Expected**: Colors use Fluent UI tokens

### Test 7: Responsive Design
1. Resize the browser window to tablet size
   - **Expected**: AI buttons remain visible and functional
2. Resize to mobile size
   - **Expected**: Layout adjusts appropriately

## Expected User Flow

1. User opens app in Microsoft Edge
2. User sees "AI Assistant" button and clicks it
3. Tooltip explains how to open Copilot (Ctrl+Shift+.)
4. User clicks "AI Actions" to see available prompts
5. User selects a prompt, it's copied to clipboard
6. User opens Copilot with keyboard shortcut
7. User pastes prompt and gets AI-powered analysis
8. Copilot can read the hidden context to provide accurate responses

## Browser Compatibility

### Supported (Full Features)
- Microsoft Edge (Chromium-based)

### Partially Supported (Detection Only)
- All other browsers will work normally but won't show AI features

### User Agent Strings Detected
- Contains "edg/" (modern Edge Chromium)
- Contains "edge/" (legacy Edge, though less common)

## Troubleshooting

### Issue: AI buttons don't appear in Edge
**Cause**: User agent detection may have failed
**Solution**: Check browser version is Edge Chromium

### Issue: Clipboard copy fails
**Cause**: Clipboard API not available or permissions denied
**Solution**: Fallback alert will show with prompt text

### Issue: Copilot can't read context
**Cause**: Browser may have stripped hidden content
**Solution**: Hidden content uses standard visually-hidden pattern

### Issue: Toast notification doesn't disappear
**Cause**: Timer may have failed
**Solution**: Notification auto-dismisses after 4 seconds

## Security Notes

- No external APIs called
- No sensitive data exposed in hidden context
- Clipboard access only on user interaction
- CodeQL scan passed with 0 vulnerabilities

## Accessibility Notes

- Uses standard visually-hidden pattern for screen readers
- All interactive elements are keyboard accessible
- ARIA attributes properly set
- Follows Fluent UI accessibility guidelines
