import * as React from "react";
import { Button, Tooltip, makeStyles, tokens, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem, Divider } from "@fluentui/react-components";
import {
  CalendarLtr20Regular,
  CalendarDay20Regular,
  PeopleCommunity20Regular,
  LearningApp20Regular,
  DocumentTable20Regular,
  History20Regular,
  Settings20Regular,
  Share20Regular,
  MoreVertical20Regular,
  WeatherSunny20Regular,
  WeatherMoon20Regular,
  Navigation20Regular,
  NavigationFilled,
} from "@fluentui/react-icons";
import "../styles/tooltip.css";

export type TabKey =
  | "RUN"
  | "PEOPLE"
  | "TRAINING"
  | "NEEDS"
  | "EXPORT"
  | "MONTHLY"
  | "HISTORY"
  | "ADMIN";

export interface SideRailProps {
  ready: boolean;
  sqlDb: any;
  status: string;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  themeName: "light" | "dark";
  setThemeName: (t: "light" | "dark") => void;
}

const useStyles = makeStyles({
  root: {
    minWidth: 0,
    height: "100vh",
    position: "fixed",
    top: 0,
    left: 0,
    padding: tokens.spacingVerticalS,
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: tokens.spacingVerticalS,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
    boxSizing: "border-box",
    transitionProperty: "width",
    transitionDuration: tokens.durationNormal,
  },
  expanded: {
    width: "80px",
  },
  collapsed: {
    width: "48px",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: tokens.spacingVerticalXS,
  },
  sectionHeader: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXXS}`,
    textAlign: "center",
    userSelect: "none",
  },
  grow: { flex: 1, minHeight: 0, overflow: "auto" },
  navScroll: { },
  item: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacingHorizontalXS,
    borderRadius: tokens.borderRadiusMedium,
    gap: tokens.spacingHorizontalXXS,
    cursor: "pointer",
    color: tokens.colorNeutralForeground2,
    userSelect: "none",
    minHeight: "44px",
  },
  itemActive: {
    backgroundColor: tokens.colorNeutralBackground4,
    color: tokens.colorNeutralForeground1,
  },
  label: { 
    fontSize: tokens.fontSizeBase200, 
    lineHeight: "1", 
    textAlign: "center",
  },
  labelHidden: {
    display: "none",
  },
  collapseButton: { 
    width: "100%",
    minHeight: "36px",
  },
  moreButton: { width: "100%" },
});

function RailItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; collapsed?: boolean; }){
  const s = useStyles();
  return (
    <Tooltip content={label} relationship="label">
      <div className={`${s.item} ${active ? s.itemActive : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
        {icon}
        <span className={`${s.label} ${collapsed ? s.labelHidden : ""}`}>{label}</span>
      </div>
    </Tooltip>
  );
}

export default function SideRail({
  ready,
  sqlDb,
  status,
  activeTab,
  setActiveTab,
  themeName,
  setThemeName,
}: SideRailProps){
  const s = useStyles();
  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      const saved = localStorage.getItem("sideRailCollapsed");
      return saved === "true";
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem("sideRailCollapsed", String(collapsed));
    } catch {}
  }, [collapsed]);

  // Reorganized navigation with workflow grouping
  const dailyWork: TabKey[] = ["RUN", "MONTHLY"];
  const setup: TabKey[] = ["PEOPLE", "TRAINING", "NEEDS"];
  const output: TabKey[] = ["EXPORT", "HISTORY"];
  const system: TabKey[] = ["ADMIN"];

  const sections = [
    { title: collapsed ? "" : "Daily", tabs: dailyWork },
    { title: collapsed ? "" : "Setup", tabs: setup },
    { title: collapsed ? "" : "Output", tabs: output },
    { title: collapsed ? "" : "System", tabs: system },
  ];

  const getIcon = (key: TabKey) => {
    switch (key) {
      case "RUN": return <CalendarDay20Regular />;
      case "MONTHLY": return <CalendarLtr20Regular />;
      case "PEOPLE": return <PeopleCommunity20Regular />;
      case "TRAINING": return <LearningApp20Regular />;
      case "NEEDS": return <DocumentTable20Regular />;
      case "EXPORT": return <Share20Regular />;
      case "HISTORY": return <History20Regular />;
      case "ADMIN": return <Settings20Regular />;
      default: return null;
    }
  };

  const getLabel = (key: TabKey) => {
    switch (key) {
      case "RUN": return "Run";
      case "MONTHLY": return "Monthly";
      case "PEOPLE": return "People";
      case "TRAINING": return "Training";
      case "NEEDS": return "Needs";
      case "EXPORT": return "Export";
      case "HISTORY": return "History";
      case "ADMIN": return "Admin";
      default: return "";
    }
  };

  return (
    <aside className={`${s.root} ${collapsed ? s.collapsed : s.expanded}`} aria-label="App navigation">
      {/* Collapse/Expand toggle */}
      <div className={s.section}>
        <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} relationship="label">
          <Button
            appearance="subtle"
            size="small"
            className={s.collapseButton}
            icon={collapsed ? <Navigation20Regular /> : <NavigationFilled />}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          />
        </Tooltip>
      </div>

      {/* Navigation sections */}
      <div className={`${s.section} ${s.grow}`}>
        {sections.map((section, sectionIdx) => (
          <React.Fragment key={sectionIdx}>
            {sectionIdx > 0 && <Divider />}
            {section.title && !collapsed && (
              <div className={s.sectionHeader}>{section.title}</div>
            )}
            {section.tabs.map(tabKey => (
              <RailItem
                key={tabKey}
                icon={getIcon(tabKey)}
                label={getLabel(tabKey)}
                active={activeTab === tabKey}
                onClick={() => setActiveTab(tabKey)}
                collapsed={collapsed}
              />
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* Theme toggle at bottom */}
      <div className={s.section}>
        <Divider />
        <Tooltip content={themeName === 'dark' ? 'Switch to Light' : 'Switch to Dark'} relationship="label">
          <div
            className={s.item}
            role="button"
            aria-label={themeName === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
            onClick={() => setThemeName(themeName === "dark" ? "light" : "dark")}
          >
            {themeName === "dark" ? <WeatherMoon20Regular /> : <WeatherSunny20Regular />}
            <span className={`${s.label} ${collapsed ? s.labelHidden : ""}`}>
              {themeName === "dark" ? "Dark" : "Light"}
            </span>
          </div>
        </Tooltip>
      </div>
    </aside>
  );
}
