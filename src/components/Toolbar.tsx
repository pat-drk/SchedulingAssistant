import React from "react";
import { Button, Tab, TabList, Tooltip, Spinner, Text, Switch, Toolbar as FluentToolbar, ToolbarButton, ToolbarDivider, makeStyles, tokens } from "@fluentui/react-components";
import { Add20Regular, FolderOpen20Regular, Save20Regular, SaveCopy20Regular } from "@fluentui/react-icons";

type TabKey = "RUN" | "PEOPLE" | "NEEDS" | "EXPORT" | "MONTHLY" | "HISTORY" | "ADMIN";

interface ToolbarProps {
  ready: boolean;
  sqlDb: any;
  canSave: boolean;
  createNewDb: () => void;
  openDbFromFile: () => void;
  saveDb: () => void;
  saveDbAs: () => void;
  status: string;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  themeName: "light" | "dark";
  setThemeName: (t: "light" | "dark") => void;
}

const useStyles = makeStyles({
  root: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
  gap: tokens.spacingHorizontalM,
  padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  left: {
    display: "flex",
    alignItems: "center",
  gap: tokens.spacingHorizontalS,
  },
  status: {
    color: tokens.colorNeutralForeground2,
    minWidth: 0,
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  tabList: {
    marginLeft: tokens.spacingHorizontalS,
  },
  right: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS },
  actionsBar: { alignItems: 'center' },
});

export default function Toolbar({
  ready,
  sqlDb,
  canSave,
  createNewDb,
  openDbFromFile,
  saveDb,
  saveDbAs,
  status,
  activeTab,
  setActiveTab,
  themeName,
  setThemeName,
}: ToolbarProps) {
  const s = useStyles();

  return (
    <div className={s.root}>
      <div className={s.left}>
        <img src={`${import.meta.env.BASE_URL}favicon-32x32.png`} alt="Scheduler" width={32} height={32} />
        {!sqlDb && <Tooltip content="No database loaded" relationship="label"><Spinner size="tiny" /></Tooltip>}
  <FluentToolbar aria-label="File actions" className={s.actionsBar} size="small">
          <Tooltip content="New DB" relationship="label">
            <ToolbarButton appearance="primary" icon={<Add20Regular />} onClick={createNewDb}>New</ToolbarButton>
          </Tooltip>
          <Tooltip content="Open DB" relationship="label">
            <ToolbarButton icon={<FolderOpen20Regular />} onClick={openDbFromFile}>Open</ToolbarButton>
          </Tooltip>
          <ToolbarDivider />
          <Tooltip content="Save" relationship="label">
            <ToolbarButton icon={<Save20Regular />} onClick={saveDb} disabled={!canSave}>Save</ToolbarButton>
          </Tooltip>
          <Tooltip content="Save As" relationship="label">
            <ToolbarButton icon={<SaveCopy20Regular />} onClick={saveDbAs} disabled={!sqlDb}>Save As</ToolbarButton>
          </Tooltip>
  </FluentToolbar>
      </div>

      <div className={s.tabList}>
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, data) => setActiveTab(data.value as TabKey)}
        >
          <Tab value="RUN">Daily Run</Tab>
          <Tab value="PEOPLE">People</Tab>
          <Tab value="NEEDS">Baseline Needs</Tab>
          <Tab value="EXPORT">Export Preview</Tab>
          <Tab value="MONTHLY">Monthly Defaults</Tab>
          <Tab value="HISTORY">Crew History</Tab>
          <Tab value="ADMIN">Admin</Tab>
        </TabList>
      </div>
      <div className={s.right}>
        <Switch
          checked={themeName === "dark"}
          onChange={(_, d) => setThemeName(d.checked ? "dark" : "light")}
          label="Dark"
        />
        <Text size={200} className={s.status}>{status}</Text>
      </div>
    </div>
  );
}
