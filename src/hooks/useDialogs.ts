import { useState, useCallback } from "react";

export interface AlertOptions {
  title?: string;
  message: string;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

export function useDialogs() {
  const [alertState, setAlertState] = useState<AlertOptions | null>(null);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (confirmed: boolean) => void;
  } | null>(null);

  const showAlert = useCallback((message: string, title?: string) => {
    setAlertState({ message, title });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState(null);
  }, []);

  const showConfirm = useCallback((message: string, titleOrOptions?: string | ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      const options: ConfirmOptions = typeof titleOrOptions === "string"
        ? { message, title: titleOrOptions }
        : { message, ...(titleOrOptions || {}) };
      
      setConfirmState({ options, resolve });
    });
  }, []);

  const handleConfirm = useCallback((confirmed: boolean) => {
    if (confirmState) {
      confirmState.resolve(confirmed);
      setConfirmState(null);
    }
  }, [confirmState]);

  return {
    // Alert
    alertState,
    showAlert,
    closeAlert,
    // Confirm
    confirmState,
    showConfirm,
    handleConfirm,
  };
}
