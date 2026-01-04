import React from 'react';
import { Box, Text, useInput } from 'ink';
import { formatDuration, truncate } from '../utils/format.js';
import type { Run } from '../api/types.js';

interface CanceledProps {
  run: Run;
  onDone: () => void;
}

export function Canceled({ run, onDone }: CanceledProps): React.ReactElement {
  useInput((input, key) => {
    if (key.return) {
      onDone();
    }
  });

  const taskPrompt = run.workOrder?.taskPrompt || '';
  const repoName =
    run.workOrder?.workspaceSource
      ? `${run.workOrder.workspaceSource.owner}/${run.workOrder.workspaceSource.repo}`
      : '';

  const duration = run.duration || 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
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
          <Text color="gray" bold>
            CANCELED
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Task canceled</Text>
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

      <Box marginBottom={1}>
        <Text>The task was canceled after {formatDuration(duration)}.</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">No changes were pushed.</Text>
      </Box>

      {/* Spacer */}
      <Box flexGrow={1} minHeight={4} />

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">[Enter] Done</Text>
      </Box>
    </Box>
  );
}
