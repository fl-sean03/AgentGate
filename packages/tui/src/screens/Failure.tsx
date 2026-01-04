import React from 'react';
import { Box, Text, useInput } from 'ink';
import { formatDuration, truncate } from '../utils/format.js';
import type { Run } from '../api/types.js';

interface FailureProps {
  run: Run;
  onDone: () => void;
  onRetry: () => void;
}

export function Failure({ run, onDone, onRetry }: FailureProps): React.ReactElement {
  useInput((input, key) => {
    if (key.return) {
      onDone();
      return;
    }

    if (input === 'r') {
      onRetry();
    }
  });

  const taskPrompt = run.workOrder?.taskPrompt || '';
  const repoName =
    run.workOrder?.workspaceSource
      ? `${run.workOrder.workspaceSource.owner}/${run.workOrder.workspaceSource.repo}`
      : '';

  const errorLevel = run.error?.level || 'Unknown';
  const errorMessage = run.error?.message || 'Unknown error';
  const errorDetails = run.error?.details;
  const errorFile = run.error?.file;
  const errorLine = run.error?.line;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="red"
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
          <Text color="red" bold>
            FAILED
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="red">✗ Task failed after {run.iteration} iteration{run.iteration > 1 ? 's' : ''}</Text>
      </Box>

      {/* Repository and task */}
      <Box marginTop={1}>
        <Text color="cyan">{repoName}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="gray">{truncate(taskPrompt, 60)}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">───────────────────────────────────────────</Text>
      </Box>

      {/* Error details */}
      <Box marginBottom={1}>
        <Text color="red">{errorLevel} verification failed:</Text>
      </Box>

      {errorFile && (
        <Box marginBottom={1} paddingLeft={2}>
          <Text color="gray">
            {errorFile}
            {errorLine && `:${errorLine}`}
          </Text>
        </Box>
      )}

      <Box marginBottom={1} paddingLeft={2}>
        <Text>{errorMessage}</Text>
      </Box>

      {errorDetails && (
        <Box marginBottom={1} paddingLeft={2}>
          <Text color="gray">{errorDetails}</Text>
        </Box>
      )}

      <Box marginTop={1} marginBottom={1}>
        <Text color="gray">
          The agent couldn't resolve this issue automatically.
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="gray">
          You may need to fix this manually or adjust the task.
        </Text>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">[Enter] Done  [r] Retry with more iterations</Text>
      </Box>
    </Box>
  );
}
