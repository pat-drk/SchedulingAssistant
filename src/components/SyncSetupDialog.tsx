import React, { useState } from 'react';
import { 
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, 
  Button, Input, Label, makeStyles, tokens, Text 
} from "@fluentui/react-components";

const useStyles = makeStyles({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  warning: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase200,
  }
});

interface SyncSetupDialogProps {
  open: boolean;
  onDismiss: () => void;
  onSetup: (handle: FileSystemDirectoryHandle, signalUrl: string) => void;
  userEmail: string;
}

export default function SyncSetupDialog({ open, onDismiss, onSetup, userEmail }: SyncSetupDialogProps) {
  const styles = useStyles();
  const [signalUrl, setSignalUrl] = useState("ws://localhost:8080");
  const [error, setError] = useState<string | null>(null);

  const handleSelectFolder = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        setError("File System Access API not supported in this browser.");
        return;
      }
      
      const handle = await (window as any).showDirectoryPicker({
        id: 'sync-folder',
        mode: 'readwrite',
      });

      onSetup(handle, signalUrl);
      onDismiss();
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e.message);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, { open }) => !open && onDismiss()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Setup Simultaneous Editing</DialogTitle>
          <DialogContent className={styles.content}>
            <Text>
              To enable multi-user editing, please select the shared folder where your team saves changes.
              This should be a folder synced by OneDrive, Dropbox, or Box.
            </Text>
            
            <div className={styles.field}>
              <Label>Signal Proxy URL (Doorbell)</Label>
              <Input 
                value={signalUrl} 
                onChange={(_, d) => setSignalUrl(d.value)} 
                placeholder="ws://localhost:8080"
              />
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                This WebSocket server notifies other users immediately when you save.
              </Text>
            </div>

            {!userEmail && (
               <Text className={styles.warning}>
                 Warning: You must set your email in the app before syncing.
               </Text>
            )}

            {error && <Text className={styles.warning}>{error}</Text>}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onDismiss}>Cancel</Button>
            <Button appearance="primary" onClick={handleSelectFolder} disabled={!userEmail}>
              Select Shared Folder
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
