import * as React from "react";
import { useState } from "react";
import { 
  Button, 
  Popover, 
  PopoverSurface, 
  PopoverTrigger,
  makeStyles,
  tokens,
  Text
} from "@fluentui/react-components";
import { Sparkle20Regular } from "@fluentui/react-icons";
import { getFormattedCopilotShortcut } from "../utils/edgeBrowser";

const useStyles = makeStyles({
  button: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    "&:hover": {
      backgroundColor: tokens.colorBrandBackgroundHover,
    },
  },
  popoverContent: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    maxWidth: "320px",
  },
  shortcutText: {
    fontFamily: tokens.fontFamilyMonospace,
    backgroundColor: tokens.colorNeutralBackground3,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    display: "inline-block",
  },
  arrow: {
    fontSize: "24px",
    color: tokens.colorBrandForeground1,
  },
  instructionText: {
    lineHeight: tokens.lineHeightBase300,
  }
});

/**
 * CopilotHelper Component
 * Displays an AI Assistant button that shows a helpful tooltip pointing users 
 * to the Edge Copilot sidebar and keyboard shortcut
 */
export default function CopilotHelper() {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const shortcut = getFormattedCopilotShortcut();

  return (
    <Popover 
      open={open} 
      onOpenChange={(_, data) => setOpen(data.open)}
      positioning="below-end"
    >
      <PopoverTrigger disableButtonEnhancement>
        <Button 
          appearance="primary"
          icon={<Sparkle20Regular />}
          className={styles.button}
        >
          AI Assistant
        </Button>
      </PopoverTrigger>
      <PopoverSurface>
        <div className={styles.popoverContent}>
          <div>
            <Text weight="semibold" size={400}>
              Use Edge Copilot to Analyze This Page
            </Text>
          </div>
          
          <div className={styles.instructionText}>
            <Text size={300}>
              Press <span className={styles.shortcutText}>{shortcut}</span> or click the Copilot logo <span className={styles.arrow}>↗</span> in the top-right sidebar to analyze this screen.
            </Text>
          </div>
          
          <div className={styles.instructionText}>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              Copilot can read the page content and help you understand schedules, identify conflicts, and answer questions about the app.
            </Text>
          </div>
        </div>
      </PopoverSurface>
    </Popover>
  );
}
