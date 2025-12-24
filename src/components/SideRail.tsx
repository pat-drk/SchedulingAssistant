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
  WeatherSunny20Regular,
  WeatherMoon20Regular,
  Navigation20Regular,
  NavigationFilled,
  MoreHorizontal20Regular,
} from "@fluentui/react-icons";
import { useIsMobile } from "../hooks/useMediaQuery";
import { MOBILE_NAV_HEIGHT, BREAKPOINTS } from "../styles/breakpoints";
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
    width: "72px",
    height: "100vh",
    position: "fixed",
    top: 0,
    left: 0,
    padding: `${tokens.spacingVerticalS} 0`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalXS,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "auto",
    boxSizing: "border-box",
    transitionProperty: "width",
    transitionDuration: tokens.durationNormal,
    // Hide on mobile
    [`@media ${BREAKPOINTS.mobile.maxQuery}`]: {
      display: "none",
    },
  },
  // Mobile bottom navigation
  bottomNav: {
    display: "none",
    [`@media ${BREAKPOINTS.mobile.maxQuery}`]: {
      display: "flex",
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      height: MOBILE_NAV_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXS}`,
      borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
      backgroundColor: tokens.colorNeutralBackground1,
      zIndex: 1000,
      boxShadow: tokens.shadow16,
      transition: `transform ${tokens.durationNormal} ${tokens.curveEasyEase}`,
    },
  },
  expanded: {
    width: "80px",
  },
  collapsed: {
    width: "48px",
  },
  navList: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalXXS,
    flex: 1,
    width: "100%",
  },
  item: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXS}`,
    borderRadius: tokens.borderRadiusMedium,
    gap: tokens.spacingVerticalXXS,
    cursor: "pointer",
    color: tokens.colorNeutralForeground2,
    userSelect: "none",
    width: "64px",
    transition: `background-color ${tokens.durationNormal} ${tokens.curveEasyEase}, color ${tokens.durationNormal} ${tokens.curveEasyEase}`,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      color: tokens.colorNeutralForeground1,
    },
    ":active": {
      backgroundColor: tokens.colorNeutralBackground1Pressed,
    },
  },
  // Mobile bottom nav item style
  bottomNavItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXXS}`,
    borderRadius: tokens.borderRadiusMedium,
    gap: "2px",
    cursor: "pointer",
    color: tokens.colorNeutralForeground2,
    userSelect: "none",
    flex: 1,
    minWidth: "44px",
    minHeight: "44px",
    transition: `background-color ${tokens.durationNormal} ${tokens.curveEasyEase}, color ${tokens.durationNormal} ${tokens.curveEasyEase}`,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      color: tokens.colorNeutralForeground1,
    },
    ":active": {
      backgroundColor: tokens.colorNeutralBackground1Pressed,
    },
  },
  itemActive: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    color: tokens.colorBrandForeground1,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Selected,
      color: tokens.colorBrandForeground1,
    },
  },
  label: { 
    fontSize: tokens.fontSizeBase100, 
    lineHeight: tokens.lineHeightBase100,
    textAlign: "center",
    fontWeight: tokens.fontWeightRegular,
  },
  bottomNavLabel: {
    fontSize: "10px",
    lineHeight: "12px",
    textAlign: "center",
    fontWeight: tokens.fontWeightRegular,
  },
  themeToggle: {
    marginTop: "auto",
  },
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
  const isMobile = useIsMobile();

  const navItems: Array<{ key: TabKey; label: string; icon: React.ReactElement }> = [
    { key: "RUN", label: "Run", icon: <CalendarDay20Regular /> },
    { key: "MONTHLY", label: "Monthly", icon: <CalendarLtr20Regular /> },
    { key: "PEOPLE", label: "People", icon: <PeopleCommunity20Regular /> },
    { key: "TRAINING", label: "Training", icon: <LearningApp20Regular /> },
    { key: "NEEDS", label: "Needs", icon: <DocumentTable20Regular /> },
    { key: "EXPORT", label: "Export", icon: <Share20Regular /> },
    { key: "HISTORY", label: "History", icon: <History20Regular /> },
    { key: "ADMIN", label: "Admin", icon: <Settings20Regular /> },
  ];

  // For mobile, show only primary tabs in bottom nav (derived from main nav items)
  const primaryMobileTabs: TabKey[] = ["RUN", "PEOPLE", "MONTHLY"];
  const primaryMobileNavItems = navItems.filter((item) => primaryMobileTabs.includes(item.key));
  const secondaryMobileNavItems = navItems.filter((item) => !primaryMobileTabs.includes(item.key));

  if (isMobile) {
    return (
      <nav className={s.bottomNav} aria-label="App navigation">
        {primaryMobileNavItems.map((item) => (
          <div
            key={item.key}
            className={`${s.bottomNavItem} ${activeTab === item.key ? s.itemActive : ""}`}
            onClick={() => setActiveTab(item.key)}
            role="button"
            aria-current={activeTab === item.key ? "page" : undefined}
          >
            {item.icon}
            <span className={s.bottomNavLabel}>{item.label}</span>
          </div>
        ))}
        {/* More menu for additional tabs */}
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <div
              className={s.bottomNavItem}
              role="button"
              aria-label="More navigation options"
            >
              <MoreHorizontal20Regular />
              <span className={s.bottomNavLabel}>More</span>
            </div>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {secondaryMobileNavItems.map((item) => (
                <MenuItem
                  key={item.key}
                  icon={item.icon}
                  onClick={() => setActiveTab(item.key)}
                >
                  {item.label}
                </MenuItem>
              ))}
              <Divider />
              <MenuItem
                icon={themeName === "dark" ? <WeatherMoon20Regular /> : <WeatherSunny20Regular />}
                onClick={() => setThemeName(themeName === "dark" ? "light" : "dark")}
              >
                {themeName === "dark" ? "Dark Mode" : "Light Mode"}
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </nav>
    );
  }

  return (
    <aside className={s.root} aria-label="App navigation">
      <div className={s.navList}>
        {navItems.map((item) => (
          <RailItem
            key={item.key}
            icon={item.icon}
            label={item.label}
            active={activeTab === item.key}
            onClick={() => setActiveTab(item.key)}
          />
        ))}
      </div>
      <div className={s.themeToggle}>
        <Tooltip 
          content={themeName === 'dark' ? 'Switch to Light' : 'Switch to Dark'} 
          relationship="label"
        >
          <div
            className={s.item}
            role="button"
            aria-label={themeName === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
            onClick={() => setThemeName(themeName === "dark" ? "light" : "dark")}
          >
            {themeName === "dark" ? <WeatherMoon20Regular /> : <WeatherSunny20Regular />}
            <span className={s.label}>{themeName === "dark" ? "Dark" : "Light"}</span>
          </div>
        </Tooltip>
      </div>
    </aside>
  );
}
