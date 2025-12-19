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
  copilotLogo: {
    display: "inline-block",
    verticalAlign: "middle",
    marginLeft: "4px",
    marginRight: "4px",
  },
  instructionText: {
    lineHeight: tokens.lineHeightBase300,
  }
});

/**
 * Copilot Logo SVG Component
 * Renders the Microsoft Copilot colorful sparkle icon inline
 */
const CopilotLogo = ({ size = 20 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: "inline-block", verticalAlign: "middle" }}
  >
    <defs>
      <linearGradient id="copilot-gradient-1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#4CC2FF", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#0078D4", stopOpacity: 1 }} />
      </linearGradient>
      <linearGradient id="copilot-gradient-2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#B4A0FF", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#7B5CFA", stopOpacity: 1 }} />
      </linearGradient>
      <linearGradient id="copilot-gradient-3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#FF6CE8", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#C239B3", stopOpacity: 1 }} />
      </linearGradient>
      <linearGradient id="copilot-gradient-4" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#FFB657", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#FF8C00", stopOpacity: 1 }} />
      </linearGradient>
    </defs>
    {/* Center sparkle */}
    <circle cx="12" cy="12" r="2" fill="url(#copilot-gradient-1)" />
    {/* Top ray */}
    <path d="M12 2 L13 8 L11 8 Z" fill="url(#copilot-gradient-2)" />
    {/* Right ray */}
    <path d="M22 12 L16 13 L16 11 Z" fill="url(#copilot-gradient-3)" />
    {/* Bottom ray */}
    <path d="M12 22 L11 16 L13 16 Z" fill="url(#copilot-gradient-4)" />
    {/* Left ray */}
    <path d="M2 12 L8 11 L8 13 Z" fill="url(#copilot-gradient-1)" />
    {/* Top-right diagonal */}
    <path d="M18 6 L13.5 10.5 L14.5 11.5 Z" fill="url(#copilot-gradient-2)" />
    {/* Bottom-right diagonal */}
    <path d="M18 18 L13.5 13.5 L14.5 12.5 Z" fill="url(#copilot-gradient-3)" />
    {/* Bottom-left diagonal */}
    <path d="M6 18 L10.5 13.5 L9.5 12.5 Z" fill="url(#copilot-gradient-4)" />
    {/* Top-left diagonal */}
    <path d="M6 6 L10.5 10.5 L9.5 11.5 Z" fill="url(#copilot-gradient-1)" />
  </svg>
);

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
              Press <span className={styles.shortcutText}>{shortcut}</span> or click the Copilot logo <span className={styles.copilotLogo}><CopilotLogo size={20} /></span> in the top-right sidebar to analyze this screen.
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
