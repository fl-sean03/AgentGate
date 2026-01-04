import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Spinner } from '../components/Spinner.js';

interface IterationProps {
  currentIteration: number;
  maxIterations: number;
  failedLevel: string;
  errorSummary: string;
  onContinue: () => void;
}

export function Iteration({
  currentIteration,
  maxIterations,
  failedLevel,
  errorSummary,
  onContinue,
}: IterationProps): React.ReactElement {
  const [countdown, setCountdown] = useState(3);
  const nextIteration = currentIteration + 1;

  // Auto-advance countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onContinue();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onContinue]);

  // Handle Enter key to advance immediately
  useInput((input, key) => {
    if (key.return) {
      onContinue();
    }
  });

  // Progress bar
  const progressWidth = 30;
  const filledWidth = Math.floor((currentIteration / maxIterations) * progressWidth);
  const emptyWidth = progressWidth - filledWidth;
  const progressBar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
  const progressPercent = Math.floor((currentIteration / maxIterations) * 100);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      padding={1}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Box>
          <Text bold color="cyan">
            AgentGate
          </Text>
        </Box>
        <Box>
          <Text color="yellow" bold>
            ITERATING
          </Text>
        </Box>
      </Box>

      {/* Iteration transition */}
      <Box marginTop={1} justifyContent="center">
        <Text bold color="yellow">
          Iteration {currentIteration} → {nextIteration}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">───────────────────────────────────────────</Text>
      </Box>

      {/* Failed level */}
      <Box marginTop={1}>
        <Text color="red">
          {failedLevel} verification failed
        </Text>
      </Box>

      {/* Error summary */}
      {errorSummary && (
        <Box marginTop={1} paddingLeft={2}>
          <Text color="gray">{errorSummary}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">───────────────────────────────────────────</Text>
      </Box>

      {/* Progress indicator */}
      <Box marginTop={1}>
        <Text color="gray">Progress: </Text>
        <Text color="yellow">{progressBar}</Text>
        <Text color="gray"> {progressPercent}%</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">
          Iteration {currentIteration} of {maxIterations} ({maxIterations - currentIteration} remaining)
        </Text>
      </Box>

      {/* Auto-advance message */}
      <Box marginTop={1}>
        <Box marginRight={1}>
          <Spinner />
        </Box>
        <Text color="gray">
          Continuing in {countdown}s...
        </Text>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">
          [Enter] Continue now
        </Text>
      </Box>
    </Box>
  );
}
