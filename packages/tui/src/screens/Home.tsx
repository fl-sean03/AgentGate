import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useRepos } from '../hooks/useRepos.js';
import { TextInput } from '../components/TextInput.js';
import { RepoList } from '../components/RepoList.js';
import { Spinner } from '../components/Spinner.js';
import { formatDuration } from '../utils/format.js';
import type { Repository } from '../api/types.js';

interface HomeProps {
  onSelectRepo: (repo: Repository) => void;
  onViewRuns: () => void;
  onViewRunning: () => void;
  activeRunId: string | null;
}

export function Home({
  onSelectRepo,
  onViewRuns,
  onViewRunning,
  activeRunId,
}: HomeProps): React.ReactElement {
  const { filteredRepos, isLoading, error, searchTerm, setSearchTerm } = useRepos();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Track elapsed time for active run
  React.useEffect(() => {
    if (!activeRunId) {
      setElapsedSeconds(0);
      return;
    }

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [activeRunId]);

  useInput((input, key) => {
    // Navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelectedIndex(Math.min(filteredRepos.length - 1, selectedIndex + 1));
      return;
    }

    // Select repo
    if (key.return) {
      const repo = filteredRepos[selectedIndex];
      if (repo) {
        onSelectRepo(repo);
      }
      return;
    }

    // View runs
    if (input === 'r') {
      onViewRuns();
      return;
    }

    // View running task
    if (input === 'v' && activeRunId) {
      onViewRunning();
      return;
    }

    // Go to top
    if (input === 'g') {
      setSelectedIndex(0);
      return;
    }

    // Go to bottom
    if (input === 'G') {
      setSelectedIndex(filteredRepos.length - 1);
      return;
    }
  });

  // Reset selection when search changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

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
          AgentGate
        </Text>
      </Box>

      {/* Running task banner */}
      {activeRunId && (
        <>
          <Box marginBottom={1}>
            <Text color="yellow">● </Text>
            <Text>Running: </Text>
            <Text color="cyan">{activeRunId.slice(0, 8)}...</Text>
            <Text color="gray"> {formatDuration(elapsedSeconds)}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="gray">───────────────────────────────────────────</Text>
          </Box>
        </>
      )}

      {/* Search input */}
      <Box marginBottom={1}>
        <Text color="gray">Search repositories...</Text>
      </Box>
      <Box marginBottom={1}>
        <TextInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Type to filter..."
        />
      </Box>

      {/* Repository list */}
      <Box marginBottom={1}>
        <Text color="gray">
          {searchTerm ? 'Matching' : 'Your Repositories'}
        </Text>
      </Box>

      {isLoading ? (
        <Box paddingY={2}>
          <Spinner label="Loading repositories..." />
        </Box>
      ) : error ? (
        <Box paddingY={2}>
          <Text color="red">{error}</Text>
        </Box>
      ) : (
        <RepoList repos={filteredRepos} selectedIndex={selectedIndex} />
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">
          [↑↓] Select  [Enter] Choose  [r] Runs
          {activeRunId && '  [v] View running'}
          {'  [q] Quit'}
        </Text>
      </Box>
    </Box>
  );
}
