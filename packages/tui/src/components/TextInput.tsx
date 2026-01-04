import React from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../utils/colors.js';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  onEscape?: () => void;
  focus?: boolean;
}

export function TextInput({
  value,
  onChange,
  placeholder = '',
  onSubmit,
  onEscape,
  focus = true,
}: TextInputProps): React.ReactElement {
  useInput(
    (input, key) => {
      if (!focus) return;

      if (key.return && onSubmit) {
        onSubmit();
        return;
      }

      if (key.escape && onEscape) {
        onEscape();
        return;
      }

      if (key.backspace || key.delete) {
        onChange(value.slice(0, -1));
        return;
      }

      // Ignore control characters
      if (key.ctrl || key.meta) {
        return;
      }

      // Add printable characters
      if (input && !key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow) {
        onChange(value + input);
      }
    },
    { isActive: focus }
  );

  const displayValue = value || '';
  const showPlaceholder = displayValue.length === 0;

  return (
    <Box
      borderStyle="round"
      borderColor={focus ? 'cyan' : 'gray'}
      paddingX={1}
    >
      <Text>
        {showPlaceholder ? (
          <Text color="gray">{placeholder}</Text>
        ) : (
          <Text>{displayValue}</Text>
        )}
        {focus && <Text color="cyan">_</Text>}
      </Text>
    </Box>
  );
}
