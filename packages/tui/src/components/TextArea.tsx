import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface TextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLines?: number;
  onSubmit?: () => void;
  onEscape?: () => void;
  focus?: boolean;
}

export function TextArea({
  value,
  onChange,
  placeholder = '',
  maxLines = 10,
  onSubmit,
  onEscape,
  focus = true,
}: TextAreaProps): React.ReactElement {
  const [cursorLine, setCursorLine] = useState(0);
  const [cursorCol, setCursorCol] = useState(0);

  const lines = value.split('\n');
  const currentLineCount = lines.length;

  useInput(
    (input, key) => {
      if (!focus) return;

      if (key.escape && onEscape) {
        onEscape();
        return;
      }

      // Submit on Ctrl+Enter or Enter at end of text
      if (key.return) {
        if (key.ctrl && onSubmit) {
          onSubmit();
          return;
        }

        // Add new line if not at max
        if (currentLineCount < maxLines) {
          const currentLine = lines[cursorLine] || '';
          const before = currentLine.slice(0, cursorCol);
          const after = currentLine.slice(cursorCol);

          const newLines = [...lines];
          newLines[cursorLine] = before;
          newLines.splice(cursorLine + 1, 0, after);

          onChange(newLines.join('\n'));
          setCursorLine(cursorLine + 1);
          setCursorCol(0);
        }
        return;
      }

      if (key.backspace || key.delete) {
        if (cursorCol > 0) {
          // Delete character before cursor
          const currentLine = lines[cursorLine] || '';
          const newLine = currentLine.slice(0, cursorCol - 1) + currentLine.slice(cursorCol);
          const newLines = [...lines];
          newLines[cursorLine] = newLine;
          onChange(newLines.join('\n'));
          setCursorCol(cursorCol - 1);
        } else if (cursorLine > 0) {
          // Merge with previous line
          const prevLine = lines[cursorLine - 1] || '';
          const currentLine = lines[cursorLine] || '';
          const newLines = [...lines];
          newLines[cursorLine - 1] = prevLine + currentLine;
          newLines.splice(cursorLine, 1);
          onChange(newLines.join('\n'));
          setCursorLine(cursorLine - 1);
          setCursorCol(prevLine.length);
        }
        return;
      }

      // Arrow key navigation
      if (key.upArrow && cursorLine > 0) {
        setCursorLine(cursorLine - 1);
        const prevLine = lines[cursorLine - 1] || '';
        setCursorCol(Math.min(cursorCol, prevLine.length));
        return;
      }

      if (key.downArrow && cursorLine < lines.length - 1) {
        setCursorLine(cursorLine + 1);
        const nextLine = lines[cursorLine + 1] || '';
        setCursorCol(Math.min(cursorCol, nextLine.length));
        return;
      }

      if (key.leftArrow) {
        if (cursorCol > 0) {
          setCursorCol(cursorCol - 1);
        } else if (cursorLine > 0) {
          setCursorLine(cursorLine - 1);
          const prevLine = lines[cursorLine - 1] || '';
          setCursorCol(prevLine.length);
        }
        return;
      }

      if (key.rightArrow) {
        const currentLine = lines[cursorLine] || '';
        if (cursorCol < currentLine.length) {
          setCursorCol(cursorCol + 1);
        } else if (cursorLine < lines.length - 1) {
          setCursorLine(cursorLine + 1);
          setCursorCol(0);
        }
        return;
      }

      // Ignore control characters
      if (key.ctrl || key.meta) {
        return;
      }

      // Add printable characters
      if (input) {
        const currentLine = lines[cursorLine] || '';
        const newLine = currentLine.slice(0, cursorCol) + input + currentLine.slice(cursorCol);
        const newLines = [...lines];
        newLines[cursorLine] = newLine;
        onChange(newLines.join('\n'));
        setCursorCol(cursorCol + input.length);
      }
    },
    { isActive: focus }
  );

  const showPlaceholder = value.length === 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={focus ? 'cyan' : 'gray'}
      paddingX={1}
      paddingY={0}
      minHeight={maxLines + 2}
    >
      {showPlaceholder ? (
        <Text color="gray">{placeholder}</Text>
      ) : (
        lines.map((line, lineIndex) => (
          <Text key={lineIndex}>
            {lineIndex === cursorLine && focus ? (
              <>
                {line.slice(0, cursorCol)}
                <Text color="cyan">_</Text>
                {line.slice(cursorCol)}
              </>
            ) : (
              line || ' '
            )}
          </Text>
        ))
      )}
      {showPlaceholder && focus && <Text color="cyan">_</Text>}
    </Box>
  );
}
