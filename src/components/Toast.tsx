import React, { useEffect, useState } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import { CheckmarkCircle20Filled, DismissCircle20Filled, Info20Filled } from "@fluentui/react-icons";
import "../styles/toast.css";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastProps {
  message: ToastMessage;
  onDismiss: (id: string) => void;
}

const useStyles = makeStyles({
  container: {
    position: "fixed",
    bottom: tokens.spacingVerticalXXL,
    right: tokens.spacingHorizontalXXL,
    zIndex: 10000,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    pointerEvents: "none",
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow16,
    minWidth: "300px",
    maxWidth: "500px",
    pointerEvents: "auto",
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    animation: "slideInRight 0.3s ease-out",
  },
  success: {
    borderLeftWidth: "4px",
    borderLeftColor: tokens.colorPaletteGreenBorder1,
  },
  error: {
    borderLeftWidth: "4px",
    borderLeftColor: tokens.colorPaletteRedBorder1,
  },
  info: {
    borderLeftWidth: "4px",
    borderLeftColor: tokens.colorPaletteBlueBorder1,
  },
  icon: {
    flexShrink: 0,
  },
  message: {
    flex: 1,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
});

function Toast({ message, onDismiss }: ToastProps) {
  const styles = useStyles();

  useEffect(() => {
    const duration = message.duration ?? 3000;
    const timer = setTimeout(() => {
      onDismiss(message.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [message.id, message.duration, onDismiss]);

  const getIcon = () => {
    switch (message.type) {
      case "success":
        return <CheckmarkCircle20Filled className={styles.icon} style={{ color: tokens.colorPaletteGreenForeground1 }} />;
      case "error":
        return <DismissCircle20Filled className={styles.icon} style={{ color: tokens.colorPaletteRedForeground1 }} />;
      case "info":
        return <Info20Filled className={styles.icon} style={{ color: tokens.colorPaletteBlueForeground1 }} />;
    }
  };

  const getClassName = () => {
    const baseClass = styles.toast;
    switch (message.type) {
      case "success":
        return `${baseClass} ${styles.success}`;
      case "error":
        return `${baseClass} ${styles.error}`;
      case "info":
        return `${baseClass} ${styles.info}`;
      default:
        return baseClass;
    }
  };

  return (
    <div className={getClassName()}>
      {getIcon()}
      <div className={styles.message}>{message.message}</div>
    </div>
  );
}

interface ToastContainerProps {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ messages, onDismiss }: ToastContainerProps) {
  const styles = useStyles();

  if (messages.length === 0) return null;

  return (
    <div className={styles.container}>
      {messages.map((msg) => (
        <Toast key={msg.id} message={msg} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// Hook for managing toast messages
export function useToast() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const showToast = (type: ToastType, message: string, duration?: number) => {
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((prev) => [...prev, { id, type, message, duration }]);
  };

  const dismissToast = (id: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id));
  };

  return {
    messages,
    showToast,
    dismissToast,
    showSuccess: (msg: string, duration?: number) => showToast("success", msg, duration),
    showError: (msg: string, duration?: number) => showToast("error", msg, duration),
    showInfo: (msg: string, duration?: number) => showToast("info", msg, duration),
  };
}
