/**
 * Teams Webhook Service
 * Sends formatted schedule messages to Microsoft Teams via incoming webhook
 */

export interface ScheduleEntry {
  personName: string;
  roleName: string;
  groupName: string;
  startTime: string;
  endTime: string;
}

export interface WebhookPayload {
  date: string;
  segment: string;
  entries: ScheduleEntry[];
}

/**
 * Format time from 24-hour to 12-hour format
 */
function formatTime12h(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
  if (minutes === 0) {
    return `${hours12}${period}`;
  }
  return `${hours12}:${minutes.toString().padStart(2, '0')}${period}`;
}

/**
 * Format date for display
 */
function formatDateDisplay(dateStr: string): string {
  // dateStr is in YYYY-MM-DD format
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const monthName = date.toLocaleDateString('en-US', { month: 'long' });
  return `${dayName}, ${monthName} ${day}, ${year}`;
}

/**
 * Build an Adaptive Card payload for Teams
 */
export function buildAdaptiveCard(payload: WebhookPayload): object {
  const { date, segment, entries } = payload;
  
  // Group entries by group name
  const byGroup = new Map<string, ScheduleEntry[]>();
  for (const entry of entries) {
    const existing = byGroup.get(entry.groupName) || [];
    existing.push(entry);
    byGroup.set(entry.groupName, existing);
  }
  
  // Build body items
  const bodyItems: any[] = [
    {
      type: "TextBlock",
      text: `📅 ${formatDateDisplay(date)}`,
      wrap: true,
      weight: "Bolder",
      size: "Large"
    },
    {
      type: "TextBlock",
      text: `Segment: ${segment}`,
      wrap: true,
      spacing: "Small",
      isSubtle: true
    }
  ];
  
  // Add each group
  for (const [groupName, groupEntries] of byGroup) {
    // Group header
    bodyItems.push({
      type: "TextBlock",
      text: `**${groupName}**`,
      wrap: true,
      spacing: "Medium",
      weight: "Bolder"
    });
    
    // People in this group
    const peopleList = groupEntries.map(e => {
      const timeRange = `${formatTime12h(e.startTime)} - ${formatTime12h(e.endTime)}`;
      const roleLabel = e.roleName !== groupName ? ` (${e.roleName})` : '';
      return `• ${e.personName}${roleLabel}: ${timeRange}`;
    }).join('\n');
    
    bodyItems.push({
      type: "TextBlock",
      text: peopleList,
      wrap: true,
      spacing: "Small"
    });
  }
  
  // Summary
  bodyItems.push({
    type: "TextBlock",
    text: `Total: ${entries.length} assignments`,
    wrap: true,
    spacing: "Medium",
    isSubtle: true
  });
  
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: bodyItems
        }
      }
    ]
  };
}

/**
 * Build a simple text message for Teams (fallback if adaptive cards don't work)
 */
export function buildSimpleMessage(payload: WebhookPayload): object {
  const { date, segment, entries } = payload;
  
  // Group entries by group name
  const byGroup = new Map<string, ScheduleEntry[]>();
  for (const entry of entries) {
    const existing = byGroup.get(entry.groupName) || [];
    existing.push(entry);
    byGroup.set(entry.groupName, existing);
  }
  
  let message = `📅 **${formatDateDisplay(date)}**\n`;
  message += `Segment: ${segment}\n\n`;
  
  for (const [groupName, groupEntries] of byGroup) {
    message += `**${groupName}**\n`;
    for (const e of groupEntries) {
      const timeRange = `${formatTime12h(e.startTime)} - ${formatTime12h(e.endTime)}`;
      const roleLabel = e.roleName !== groupName ? ` (${e.roleName})` : '';
      message += `• ${e.personName}${roleLabel}: ${timeRange}\n`;
    }
    message += '\n';
  }
  
  message += `_Total: ${entries.length} assignments_`;
  
  return {
    text: message
  };
}

/**
 * Send schedule to Teams webhook
 */
export async function sendToTeamsWebhook(
  webhookUrl: string,
  payload: WebhookPayload,
  useAdaptiveCard: boolean = true
): Promise<{ success: boolean; error?: string }> {
  if (!webhookUrl) {
    return { success: false, error: 'Webhook URL is not configured' };
  }
  
  try {
    const body = useAdaptiveCard 
      ? buildAdaptiveCard(payload) 
      : buildSimpleMessage(payload);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get webhook URL from database
 */
export function getWebhookUrl(all: (sql: string, params?: any[]) => any[]): string {
  try {
    const rows = all(`SELECT value FROM meta WHERE key='teams_webhook_url'`);
    return rows[0]?.value || '';
  } catch {
    return '';
  }
}

/**
 * Save webhook URL to database
 */
export function saveWebhookUrl(run: (sql: string, params?: any[]) => void, url: string): void {
  run(
    `INSERT INTO meta (key, value) VALUES ('teams_webhook_url', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [url]
  );
}
