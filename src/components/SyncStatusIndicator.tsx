/**
 * SyncStatusIndicator - Shows sync status and who else is editing
 * Displays in the UI to give users feedback about sync state
 */

import React from 'react';
import { makeStyles, tokens, Spinner } from '@fluentui/react-components';
import { 
  CheckmarkCircle24Regular,
  ErrorCircle24Regular,
  CloudSync24Regular,
} from '@fluentui/react-icons';
import { SyncStatus } from '../sync/types';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase200,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  syncing: {
    backgroundColor: tokens.colorNeutralBackground3,
  },
  error: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
  },
  success: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
  },
  text: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  label: {
    fontWeight: tokens.fontWeightSemibold,
  },
  detail: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  users: {
    fontSize: tokens.fontSizeBase100,
    fontStyle: 'italic',
    color: tokens.colorNeutralForeground3,
  },
});

interface SyncStatusIndicatorProps {
  status: SyncStatus;
}

export default function SyncStatusIndicator({ status }: SyncStatusIndicatorProps) {
  const styles = useStyles();

  const getStatusClass = () => {
    if (status.error) return styles.error;
    if (status.isSyncing) return styles.syncing;
    if (status.lastSyncTime) return styles.success;
    return '';
  };

  const getIcon = () => {
    if (status.error) {
      return <ErrorCircle24Regular />;
    }
    if (status.isSyncing) {
      return <Spinner size="tiny" />;
    }
    if (status.lastSyncTime) {
      return <CheckmarkCircle24Regular />;
    }
    return <CloudSync24Regular />;
  };

  const getStatusText = () => {
    if (status.error) return 'Sync Error';
    if (status.isSyncing) return 'Syncing...';
    if (status.lastSyncTime) return 'Synced';
    return 'Not Synced';
  };

  const getDetailText = () => {
    if (status.error) return status.error;
    if (status.pendingChanges > 0) {
      return `${status.pendingChanges} pending change${status.pendingChanges !== 1 ? 's' : ''}`;
    }
    if (status.lastSyncTime) {
      const elapsed = Date.now() - status.lastSyncTime.getTime();
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      if (minutes > 0) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
      }
      return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    }
    return null;
  };

  const getUsersText = () => {
    if (status.otherUsers.length === 0) return null;
    if (status.otherUsers.length === 1) {
      return `${status.otherUsers[0]} is also editing`;
    }
    if (status.otherUsers.length === 2) {
      return `${status.otherUsers[0]} and ${status.otherUsers[1]} are also editing`;
    }
    return `${status.otherUsers[0]} and ${status.otherUsers.length - 1} others are editing`;
  };

  return (
    <div className={`${styles.root} ${getStatusClass()}`}>
      <div className={styles.icon}>
        {getIcon()}
      </div>
      <div className={styles.text}>
        <div className={styles.label}>{getStatusText()}</div>
        {getDetailText() && <div className={styles.detail}>{getDetailText()}</div>}
        {getUsersText() && <div className={styles.users}>{getUsersText()}</div>}
      </div>
    </div>
  );
}
