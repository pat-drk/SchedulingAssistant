import * as React from "react";
import { makeStyles, tokens, Text, Tooltip, Toolbar as FluentToolbar, ToolbarButton, ToolbarDivider, Spinner } from "@fluentui/react-components";
import { Add20Regular, FolderOpen20Regular, Save20Regular, SaveCopy20Regular, QuestionCircle20Regular, LockClosed20Regular, LockOpen20Regular, KeyReset20Regular } from "@fluentui/react-icons";
import { isEdgeBrowser } from "../utils/edgeBrowser";
import CopilotHelper from "./CopilotHelper";
import CopilotPromptMenu from "./CopilotPromptMenu";

interface TopBarProps {
  appName?: string;
  ready: boolean;
  sqlDb: any;
  canSave: boolean;
  hasLock: boolean;
  onReleaseLock?: () => void;
  createNewDb: () => void;
  openDbFromFile: () => void;
  saveDb: () => void;
  saveDbAs: () => void;
  status: string;
  isReadOnly?: boolean;
  lockedBy?: string | null;
  onForceUnlock?: () => void;
}

const useStyles = makeStyles({
  root: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    flexWrap: 'wrap',
    // Mobile adjustments
    "@media (max-width: 767px)": {
      padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}`,
      gap: tokens.spacingHorizontalXS,
    },
  },
  logo: {
    "@media (max-width: 767px)": {
      width: '24px',
      height: '24px',
    },
  },
  left: { 
    display: 'flex', 
    alignItems: 'center', 
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
    flex: '1 1 auto',
    // Stack on very small screens
    "@media (max-width: 767px)": {
      gap: tokens.spacingHorizontalXS,
    },
  },
  actionsBar: { 
    alignItems: 'center',
    // Hide button text on mobile, show icon only
    "@media (max-width: 767px)": {
      '& button': {
        minWidth: '32px',
        padding: tokens.spacingHorizontalXS,
        '& > span:not(:has(svg))': {
          display: 'none',
        },
      },
    },
  },
  right: { 
    display: 'flex', 
    alignItems: 'center', 
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
    "@media (max-width: 767px)": {
      gap: tokens.spacingHorizontalXS,
      flex: '0 0 auto',
    },
  },
  status: { 
    color: tokens.colorNeutralForeground2, 
    whiteSpace: 'nowrap', 
    overflow: 'hidden', 
    textOverflow: 'ellipsis', 
    minWidth: 0,
    // Hide on mobile screens
    "@media (max-width: 767px)": {
      display: 'none',
    },
  },
  mobileHidden: {
    "@media (max-width: 767px)": {
      display: 'none',
    },
  },
});

export default function TopBar({ appName = 'Scheduler', ready, sqlDb, canSave, hasLock, onReleaseLock, createNewDb, openDbFromFile, saveDb, saveDbAs, status, isReadOnly, lockedBy, onForceUnlock }: TopBarProps){
  const s = useStyles();
  const isEdge = isEdgeBrowser();
  
  const handleHelpClick = () => {
    window.open(`${import.meta.env.BASE_URL}documentation.html`, '_blank', 'noopener,noreferrer');
  };
  
  return (
    <header className={s.root}>
      <div className={s.left}>
        <img src={`${import.meta.env.BASE_URL}favicon-32x32.png`} alt={appName} width={32} height={32} className={s.logo} />
        {!sqlDb && <Tooltip content="No database loaded" relationship="label"><Spinner size="tiny" /></Tooltip>}
        <FluentToolbar aria-label="File actions" className={s.actionsBar} size="small">
          <Tooltip content="New DB" relationship="label">
            <ToolbarButton appearance="primary" icon={<Add20Regular />} onClick={createNewDb}>New</ToolbarButton>
          </Tooltip>
          <Tooltip content="Open Project Folder" relationship="label">
            <ToolbarButton icon={<FolderOpen20Regular />} onClick={openDbFromFile}>Open</ToolbarButton>
          </Tooltip>
          <ToolbarDivider />
          <Tooltip content={isReadOnly ? "Read Only - Locked by " + lockedBy : "Save"} relationship="label">
            <ToolbarButton 
              icon={<Save20Regular />} 
              onClick={saveDb} 
              disabled={!canSave || isReadOnly}
            >
              Save
            </ToolbarButton>
          </Tooltip>
          <Tooltip content="Save Copy" relationship="label">
            <ToolbarButton icon={<SaveCopy20Regular />} onClick={saveDbAs} disabled={!sqlDb}>Save Copy</ToolbarButton>
          </Tooltip>
          
          {sqlDb && (
            <>
              <ToolbarDivider />
              {isReadOnly !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Tooltip content={isReadOnly ? `Locked by ${lockedBy}` : "You have the lock"} relationship="label">
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px' }}>
                       {isReadOnly ? 
                         <LockClosed20Regular style={{color: tokens.colorPaletteRedForeground1}} /> : 
                         <LockOpen20Regular style={{color: tokens.colorPaletteGreenForeground1}} />
                       }
                       <Text size={200} style={{ color: isReadOnly ? tokens.colorPaletteRedForeground1 : tokens.colorPaletteGreenForeground1 }}>
                         {isReadOnly ? "Locked" : "Editing"}
                       </Text>
                     </div>
                  </Tooltip>
                  
                  {isReadOnly && onForceUnlock && (
                    <Tooltip content="Force Unlock (Use with caution)" relationship="label">
                      <ToolbarButton 
                        icon={<KeyReset20Regular />} 
                        onClick={onForceUnlock}
                        style={{ color: tokens.colorPaletteRedForeground1 }}
                      >
                        Force Unlock
                      </ToolbarButton>
                    </Tooltip>
                  )}
                  
                  {!isReadOnly && hasLock && onReleaseLock && (
                    <Tooltip content="Release your edit lock so others can edit (you'll need to reload to edit again)" relationship="label">
                      <ToolbarButton 
                        icon={<LockOpen20Regular />} 
                        onClick={onReleaseLock}
                      >
                        Release Lock
                      </ToolbarButton>
                    </Tooltip>
                  )}
                </div>
              )}
            </>
          )}

        </FluentToolbar>
      </div>      <div className={s.right}>
        {isReadOnly && <Text style={{color: tokens.colorPaletteRedForeground1, fontWeight: 'bold'}}>READ ONLY MODE</Text>}
        {isEdge && <CopilotHelper />}
        {isEdge && <CopilotPromptMenu />}
        <FluentToolbar aria-label="Help actions" size="small">
          <Tooltip content="Open documentation" relationship="label">
            <ToolbarButton icon={<QuestionCircle20Regular />} onClick={handleHelpClick}>Help</ToolbarButton>
          </Tooltip>
        </FluentToolbar>
        <Text size={200} className={s.status}>{status}</Text>
      </div>
    </header>
  );
}
