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
import AlertDialog from "./AlertDialog";
import { useDialogs } from "../hooks/useDialogs";

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
    key: "explain",
    label: "Help me understand this view",
    prompt: "Explain what I'm looking at on this page and how to use the main features visible.",
  },
  {
    key: "howto-assign",
    label: "How do I make an assignment?",
    prompt: "Walk me through the steps to assign someone to a role on this scheduling page.",
  },
  {
    key: "howto-navigate",
    label: "How do I navigate the app?",
    prompt: "Explain how to navigate between different sections and views in this scheduling application.",
  },
  {
    key: "troubleshoot",
    label: "Something isn't working",
    prompt: "I'm having trouble with something on this page. Help me troubleshoot what might be wrong and how to fix it.",
  },
  {
    key: "features",
    label: "What can I do here?",
    prompt: "List the main features and actions available on this page and briefly explain what each one does.",
  },
];

/**
 * CopilotPromptMenu Component
 * Provides a dropdown menu with pre-built prompts that can be copied to clipboard
 * for use with Edge Copilot
 */
export default function CopilotPromptMenu() {
  const styles = useStyles();
  const dialogs = useDialogs();
  const [showToast, setShowToast] = useState(false);
  const shortcut = getCopilotShortcut();

  const handlePromptSelect = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    } catch (err) {
      // Fallback: show alert if clipboard API fails
      dialogs.showAlert(`Prompt ready:\n\n${prompt}\n\nPress ${shortcut} to open Copilot and paste.`, "Prompt Ready");
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
      
      {dialogs.alertState && (
        <AlertDialog
          open={true}
          title={dialogs.alertState.title}
          message={dialogs.alertState.message}
          onClose={dialogs.closeAlert}
        />
      )}
    </>
  );
}
