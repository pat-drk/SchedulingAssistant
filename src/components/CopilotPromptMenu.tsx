import * as React from "react";
import { useState } from "react";
import {
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Button,
  makeStyles,
  tokens,
  Text,
} from "@fluentui/react-components";
import { ChevronDown20Regular, Lightbulb20Regular } from "@fluentui/react-icons";
import { getCopilotShortcut } from "../utils/edgeBrowser";

const useStyles = makeStyles({
  toastContainer: {
    position: "fixed",
    bottom: tokens.spacingVerticalXXL,
    right: tokens.spacingHorizontalXXL,
    zIndex: 1000,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow16,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    animation: "slideInUp 0.3s ease-out",
  },
  toastText: {
    maxWidth: "300px",
  },
  shortcutText: {
    fontFamily: tokens.fontFamilyMonospace,
    fontWeight: tokens.fontWeightSemibold,
  },
});

const PROMPTS = [
  {
    key: "summarize",
    label: "Summarize this schedule",
    prompt: "Summarize the current schedule view on this page, including any staffing gaps or conflicts.",
  },
  {
    key: "analyze",
    label: "Analyze coverage gaps",
    prompt: "Analyze the staffing coverage on this page and identify any roles that are understaffed or overstaffed.",
  },
  {
    key: "explain",
    label: "Help me understand this view",
    prompt: "Explain what I'm looking at on this page and how to use the main features visible.",
  },
  {
    key: "conflicts",
    label: "Find scheduling conflicts",
    prompt: "Look at the assignments on this page and identify any scheduling conflicts or issues.",
  },
  {
    key: "optimize",
    label: "Suggest optimal assignments",
    prompt: "Based on the current schedule and staffing needs shown, suggest optimal assignment changes.",
  },
];

/**
 * CopilotPromptMenu Component
 * Provides a dropdown menu with pre-built prompts that can be copied to clipboard
 * for use with Edge Copilot
 */
export default function CopilotPromptMenu() {
  const styles = useStyles();
  const [showToast, setShowToast] = useState(false);
  const shortcut = getCopilotShortcut();

  const handlePromptSelect = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    } catch (err) {
      // Fallback: show alert if clipboard API fails
      alert(`Prompt ready:\n\n${prompt}\n\nPress ${shortcut} to open Copilot and paste.`);
    }
  };

  return (
    <>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <Button 
            appearance="subtle"
            icon={<Lightbulb20Regular />}
          >
            AI Actions
            <ChevronDown20Regular />
          </Button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {PROMPTS.map((item) => (
              <MenuItem 
                key={item.key}
                onClick={() => handlePromptSelect(item.prompt)}
              >
                {item.label}
              </MenuItem>
            ))}
          </MenuList>
        </MenuPopover>
      </Menu>

      {showToast && (
        <div className={styles.toastContainer}>
          <Text className={styles.toastText}>
            ✅ Prompt copied! Open Copilot (<span className={styles.shortcutText}>{shortcut}</span>) and paste.
          </Text>
        </div>
      )}
    </>
  );
}
