import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../utils/colors.js';

export interface IterationProps {
  currentIteration: number;
  maxIterations: number;
  failedLevel: string;
  errorSummary: string;
  onContinue: () => void;
}

const AUTO_ADVANCE_DELAY_MS = 3000;

export function Iteration({
  currentIteration,
  maxIterations,
  failedLevel,
  errorSummary,
  onContinue,
}: IterationProps): React.ReactElement {
  const nextIteration = currentIteration + 1;
  const [countdown, setCountdown] = useState(3);

  // Auto-advance after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onContinue();
    }, AUTO_ADVANCE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [onContinue]);

  // Countdown timer for visual feedback
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Allow Enter key to advance immediately
  useInput((input, key) => {
    if (key.return) {
      onContinue();
    }
  });

  // Calculate progress bar
  const progressPercent = (currentIteration / maxIterations) * 100;
  const progressBarWidth = 30;
  const filledWidth = Math.round((currentIteration / maxIterations) * progressBarWidth);
  const emptyWidth = progressBarWidth - filledWidth;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={colors.warning}>
          Iteration {currentIteration} → {nextIteration}
        </Text>
      </Box>

      {/* Divider */}
      <Box marginBottom={1}>
        <Text color={colors.border}>{'─'.repeat(50)}</Text>
      </Box>

      {/* Failed level */}
      <Box marginBottom={1}>
        <Text color={colors.failure}>✗ </Text>
        <Text color={colors.text}>{failedLevel}</Text>
      </Box>

      {/* Error summary */}
      <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
        <Text color={colors.textMuted}>{errorSummary}</Text>
      </Box>

      {/* Progress indicator */}
      <Box marginTop={1} marginBottom={1}>
        <Text color={colors.secondary}>Progress: </Text>
        <Text color={colors.primary}>[</Text>
        <Text color={colors.info}>{'█'.repeat(filledWidth)}</Text>
        <Text color={colors.border}>{'░'.repeat(emptyWidth)}</Text>
        <Text color={colors.primary}>]</Text>
        <Text color={colors.text}>
          {' '}
          {currentIteration}/{maxIterations}
        </Text>
        <Text color={colors.textMuted}> ({Math.round(progressPercent)}%)</Text>
      </Box>

      {/* Auto-advance notice */}
      <Box marginTop={1}>
        <Text color={colors.textMuted}>
          Continuing in {countdown}s... (Press Enter to continue now)
        </Text>
      </Box>
    </Box>
  );
}

export default Iteration;
