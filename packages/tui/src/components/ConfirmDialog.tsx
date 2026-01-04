import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ConfirmDialogProps {
  message: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  message,
  description,
  confirmText = 'Yes',
  cancelText = 'No',
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps): React.ReactElement {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y' || key.return) {
      onConfirm();
    } else if (input === 'n' || input === 'N' || key.escape) {
      onCancel();
    }
  });

  const borderColor = destructive ? 'red' : 'yellow';
  const confirmColor = destructive ? 'red' : 'green';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      padding={1}
    >
      {/* Message */}
      <Box marginBottom={1}>
        <Text bold color={destructive ? 'red' : 'yellow'}>
          {message}
        </Text>
      </Box>

      {/* Description */}
      {description && (
        <Box marginBottom={1}>
          <Text color="gray">{description}</Text>
        </Box>
      )}

      {/* Divider */}
      <Box marginBottom={1}>
        <Text color="gray">────────────────────────────</Text>
      </Box>

      {/* Options */}
      <Box>
        <Text color={confirmColor}>[y] {confirmText}</Text>
        <Text color="gray">  </Text>
        <Text color="gray">[n] {cancelText}</Text>
      </Box>

      {/* Alternative key hints */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          or [Enter] to confirm, [Esc] to cancel
        </Text>
      </Box>
    </Box>
  );
}
