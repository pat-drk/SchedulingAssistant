/**
 * SyncStatusIndicator - Shows sync status and who else is editing
 * Displays in the UI to give users feedback about sync state.
 * 
 * Features:
 * - Sync status (synced, syncing, error, offline)
 * - Pending changes count
 * - Offline queue count
 * - Active users (presence)
 * - External change detection alert
 * - Manual "Check for updates" button
 */

import React from 'react';
import { makeStyles, tokens, Spinner, Button, Tooltip, Badge } from '@fluentui/react-components';
import { 
  CheckmarkCircle24Regular,
  ErrorCircle24Regular,
  CloudSync24Regular,
  CloudOff24Regular,
  Warning24Regular,
  ArrowSync24Regular,
  PeopleTeam24Regular,
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
  offline: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    color: tokens.colorPaletteYellowForeground2,
  },
  externalChange: {
    backgroundColor: tokens.colorPaletteMarigoldBackground1,
    color: tokens.colorPaletteMarigoldForeground1,
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
  },
  text: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontWeight: tokens.fontWeightSemibold,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  detail: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  users: {
    fontSize: tokens.fontSizeBase100,
    fontStyle: 'italic',
    color: tokens.colorNeutralForeground3,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  refreshButton: {
    minWidth: 'auto',
    padding: tokens.spacingHorizontalXS,
  },
  badge: {
    marginLeft: tokens.spacingHorizontalXS,
  },
  alertText: {
    color: tokens.colorPaletteMarigoldForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
});

interface SyncStatusIndicatorProps {
  status: SyncStatus;
  onManualSync?: () => void;
  onReloadRequest?: () => void;
  compact?: boolean;
}

export default function SyncStatusIndicator({ 
  status, 
  onManualSync,
  onReloadRequest,
  compact = false,
}: SyncStatusIndicatorProps) {
  const styles = useStyles();

  const getStatusClass = () => {
    if (status.externalChangeDetected) return styles.externalChange;
    if (!status.isOnline) return styles.offline;
    if (status.error) return styles.error;
    if (status.isSyncing) return styles.syncing;
    if (status.lastSyncTime) return styles.success;
    return '';
  };

  const getIcon = () => {
    if (status.externalChangeDetected) {
      return <Warning24Regular />;
    }
    if (!status.isOnline) {
      return <CloudOff24Regular />;
    }
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
    if (status.externalChangeDetected) return 'Changes Available';
    if (!status.isOnline) return 'Offline';
    if (status.error) return 'Sync Error';
    if (status.isSyncing) return 'Syncing...';
    if (status.lastSyncTime) return 'Synced';
    return 'Not Synced';
  };

  const getDetailText = () => {
    if (status.externalChangeDetected) {
      return 'Someone else made changes—click to reload and merge';
    }
    if (!status.isOnline && status.offlineQueueCount > 0) {
      return `${status.offlineQueueCount} change${status.offlineQueueCount !== 1 ? 's' : ''} queued for sync`;
    }
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
      if (seconds > 5) {
        return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
      }
      return 'Just now';
    }
    return null;
  };

  const getUsersText = () => {
    // Use activeUsers for more detailed presence info
    const activeUsers = status.activeUsers?.filter(u => !u.stale) || [];
    const staleUsers = status.activeUsers?.filter(u => u.stale) || [];
    
    if (activeUsers.length === 0 && staleUsers.length === 0) return null;
    
    if (activeUsers.length === 1) {
      return `${activeUsers[0].user} is also viewing`;
    }
    if (activeUsers.length === 2) {
      return `${activeUsers[0].user} and ${activeUsers[1].user} are also viewing`;
    }
    if (activeUsers.length > 2) {
      return `${activeUsers[0].user} and ${activeUsers.length - 1} others are viewing`;
    }
    
    // Only stale users
    if (staleUsers.length > 0) {
      return `${staleUsers.length} user${staleUsers.length !== 1 ? 's' : ''} recently active`;
    }
    
    return null;
  };

  // Compact mode for toolbar
  if (compact) {
    const totalPending = status.pendingChanges + (status.offlineQueueCount || 0);
    const hasActiveUsers = (status.activeUsers?.filter(u => !u.stale)?.length || 0) > 0;
    
    return (
      <Tooltip content={getDetailText() || getStatusText()} relationship="label">
        <div className={`${styles.root} ${getStatusClass()}`}>
          <div className={styles.icon}>
            {getIcon()}
          </div>
          {totalPending > 0 && (
            <Badge appearance="filled" color="important" size="small" className={styles.badge}>
              {totalPending}
            </Badge>
          )}
          {hasActiveUsers && (
            <PeopleTeam24Regular style={{ marginLeft: 4 }} />
          )}
          {onManualSync && !status.isSyncing && !status.externalChangeDetected && (
            <Button
              appearance="subtle"
              size="small"
              icon={<ArrowSync24Regular />}
              onClick={onManualSync}
              className={styles.refreshButton}
              title="Check for updates"
            />
          )}
          {status.externalChangeDetected && onReloadRequest && (
            <Button
              appearance="primary"
              size="small"
              onClick={onReloadRequest}
            >
              Reload
            </Button>
          )}
        </div>
      </Tooltip>
    );
  }

  return (
    <div className={`${styles.root} ${getStatusClass()}`}>
      <div className={styles.icon}>
        {getIcon()}
      </div>
      <div className={styles.text}>
        <div className={styles.label}>
          {getStatusText()}
          {status.offlineQueueCount > 0 && !status.isOnline && (
            <Badge appearance="filled" color="warning" size="small" className={styles.badge}>
              {status.offlineQueueCount} queued
            </Badge>
          )}
        </div>
        {getDetailText() && <div className={styles.detail}>{getDetailText()}</div>}
        {getUsersText() && (
          <div className={styles.users}>
            <PeopleTeam24Regular style={{ width: 14, height: 14 }} />
            {getUsersText()}
          </div>
        )}
      </div>
      {onManualSync && !status.isSyncing && !status.externalChangeDetected && (
        <Tooltip content="Check for updates from other users" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<ArrowSync24Regular />}
            onClick={onManualSync}
            className={styles.refreshButton}
          />
        </Tooltip>
      )}
      {status.externalChangeDetected && onReloadRequest && (
        <Button
          appearance="primary"
          size="small"
          onClick={onReloadRequest}
        >
          Reload & Merge
        </Button>
      )}
    </div>
  );
}
