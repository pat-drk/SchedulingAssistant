import React, { useState } from "react";
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Field,
  Input,
  tokens,
} from "@fluentui/react-components";

interface EmailInputDialogProps {
  open: boolean;
  onSubmit: (email: string) => void;
  onCancel: () => void;
}

export default function EmailInputDialog({
  open,
  onSubmit,
  onCancel,
}: EmailInputDialogProps) {
  const [emailInput, setEmailInput] = useState("");
  const [emailInputError, setEmailInputError] = useState("");

  const handleSubmit = () => {
    const email = emailInput.trim();
    if (!email) {
      setEmailInputError("Email is required");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailInputError("Invalid email format");
      return;
    }
    setEmailInput("");
    setEmailInputError("");
    onSubmit(email);
  };

  const handleCancel = () => {
    setEmailInput("");
    setEmailInputError("");
    onCancel();
  };

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(_, data) => !data.open && handleCancel()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Enter Your Work Email</DialogTitle>
          <DialogContent>
            <Field
              label="Work Email"
              validationMessage={emailInputError}
              validationState={emailInputError ? "error" : undefined}
              required
            >
              <Input
                value={emailInput}
                onChange={(_, data) => {
                  setEmailInput(data.value);
                  setEmailInputError("");
                }}
                placeholder="user@example.com"
                type="email"
              />
            </Field>
            <div
              style={{
                marginTop: tokens.spacingVerticalS,
                fontSize: tokens.fontSizeBase200,
                color: tokens.colorNeutralForeground3,
              }}
            >
              Your email is used for sync and personalization features.
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={handleCancel}>
              Skip
            </Button>
            <Button appearance="primary" onClick={handleSubmit}>
              Submit
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
