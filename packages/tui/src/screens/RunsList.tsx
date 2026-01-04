import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useRuns } from '../hooks/useRuns.js';
import { Spinner } from '../components/Spinner.js';
import { formatRelativeTime, truncate } from '../utils/format.js';
import { getRunStatusColor } from '../utils/colors.js';
import type { Run } from '../api/types.js';

interface RunsListProps {
  onSelectRun: (run: Run) => void;
  onBack: () => void;
}

export function RunsList({
  onSelectRun,
  onBack,
}: RunsListProps): React.ReactElement {
  const { runs, isLoading, error, hasMore, loadMore } = useRuns();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    if (key.upArrow || input === 'k') {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      const newIndex = Math.min(runs.length - 1, selectedIndex + 1);
      setSelectedIndex(newIndex);

      // Load more when near the bottom
      if (newIndex >= runs.length - 3 && hasMore) {
        loadMore();
      }
      return;
    }

    if (key.return) {
      const run = runs[selectedIndex];
      if (run) {
        onSelectRun(run);
      }
      return;
    }

    if (input === 'g') {
      setSelectedIndex(0);
      return;
    }

    if (input === 'G') {
      setSelectedIndex(runs.length - 1);
    }
  });

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'succeeded':
        return '✓';
      case 'failed':
        return '✗';
      case 'canceled':
        return '○';
      case 'running':
      case 'verifying':
        return '●';
      default:
        return '○';
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Runs
        </Text>
      </Box>

      {/* Loading state */}
      {isLoading && runs.length === 0 ? (
        <Box paddingY={2}>
          <Spinner label="Loading runs..." />
        </Box>
      ) : error ? (
        <Box paddingY={2}>
          <Text color="red">{error}</Text>
        </Box>
      ) : runs.length === 0 ? (
        <Box paddingY={2} flexDirection="column">
          <Text color="gray">No runs yet.</Text>
          <Text color="gray">Use the TUI to submit your first task!</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {runs.map((run, index) => {
            const isSelected = index === selectedIndex;
            const repoName =
              run.workOrder?.workspaceSource
                ? `${run.workOrder.workspaceSource.owner}/${run.workOrder.workspaceSource.repo}`
                : 'Unknown';
            const taskPrompt = run.workOrder?.taskPrompt || '';
            const statusColor = getRunStatusColor(run.status);

            return (
              <Box
                key={run.id}
                flexDirection="column"
                marginBottom={1}
              >
                <Box>
                  <Box width={3}>
                    <Text color={isSelected ? 'cyan' : undefined}>
                      {isSelected ? '▸ ' : '  '}
                    </Text>
                  </Box>
                  <Box width={3}>
                    <Text>{statusColor(getStatusIcon(run.status))}</Text>
                  </Box>
                  <Box flexGrow={1}>
                    <Text
                      color={isSelected ? 'cyan' : undefined}
                      bold={isSelected}
                    >
                      {repoName}
                    </Text>
                  </Box>
                  <Box>
                    <Text color="gray">
                      {formatRelativeTime(run.startedAt)}
                    </Text>
                  </Box>
                </Box>
                <Box paddingLeft={6}>
                  <Text color="gray">{truncate(taskPrompt, 50)}</Text>
                </Box>
              </Box>
            );
          })}

          {/* Loading more indicator */}
          {isLoading && runs.length > 0 && (
            <Box paddingY={1}>
              <Spinner label="Loading more..." />
            </Box>
          )}
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">
          [↑↓] Select  [Enter] View details  [Esc] Back
        </Text>
      </Box>
    </Box>
  );
}
