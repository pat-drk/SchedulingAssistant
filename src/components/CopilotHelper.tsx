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
              Press <span className={styles.shortcutText}>{shortcut}</span> or click the Copilot logo [ 
              <svg width="1322.9" height="1147.5" version="1.1" viewBox="0 0 1322.9 1147.5" fill="currentColor" style={{ height: "1em", width: "1em", verticalAlign: "-0.125em" }} xmlns="http://www.w3.org/2000/svg">
               <path d="m711.19 265.2c-27.333 0-46.933 3.07-58.8 9.33 27.067-80.267 47.6-210.13 168-210.13 114.93 0 108.4 138.27 157.87 200.8zm107.33 112.93c-35.467 125.2-70 251.2-110.13 375.33-12.133 36.4-45.733 61.6-84 61.6h-136.27c9.3333-14 16.8-28.933 21.467-45.733 35.467-125.07 70-251.07 110.13-375.33 12.133-36.4 45.733-61.6 84-61.6h136.27c-9.3333 14-16.8 28.934-21.467 45.734m-316.13 704.8c-114.93 0-108.4-138.13-157.87-200.67h267.07c27.467 0 47.067-3.07 58.8-9.33-27.067 80.266-47.6 210-168 210m777.47-758.93h0.93c-32.667-38.266-82.267-57.866-146.67-57.866h-36.4c-34.533-2.8-65.333-26.134-76.533-58.8l-36.4-103.6c-21.463-61.737-80.263-103.74-145.73-103.74h-475.07c-175.6 0-251.2 225.07-292.27 361.33-38.267 127.07-126 341.73-24.267 462.13 46.667 55.067 116.67 57.867 183.07 57.867 34.533 2.8 65.333 26.133 76.533 58.8l36.4 103.6c21.467 61.733 80.267 103.73 145.6 103.73h475.2c175.47 0 251.07-225.07 292.27-361.33 30.8-100.8 68.133-224.93 66.267-324.8 0-50.534-11.2-100-42.933-137.33"/>
              </svg>

              ] in the top-right sidebar to analyze this screen.
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
