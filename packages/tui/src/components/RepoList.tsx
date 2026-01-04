import React from 'react';
import { Box, Text } from 'ink';
import { formatRelativeTime } from '../utils/format.js';
import type { Repository } from '../api/types.js';

interface RepoListProps {
  repos: Repository[];
  selectedIndex: number;
  maxVisible?: number;
}

export function RepoList({
  repos,
  selectedIndex,
  maxVisible = 10,
}: RepoListProps): React.ReactElement {
  if (repos.length === 0) {
    return (
      <Box paddingY={1}>
        <Text color="gray">No repositories found</Text>
      </Box>
    );
  }

  // Calculate visible window
  let startIndex = 0;
  if (repos.length > maxVisible) {
    startIndex = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(maxVisible / 2), repos.length - maxVisible)
    );
  }
  const visibleRepos = repos.slice(startIndex, startIndex + maxVisible);

  return (
    <Box flexDirection="column">
      {visibleRepos.map((repo, index) => {
        const actualIndex = startIndex + index;
        const isSelected = actualIndex === selectedIndex;

        return (
          <Box key={repo.fullName} paddingY={0}>
            <Box width={3}>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '▸ ' : '  '}
              </Text>
            </Box>

            <Box flexGrow={1}>
              <Text
                color={isSelected ? 'cyan' : undefined}
                bold={isSelected}
              >
                {repo.fullName}
              </Text>
            </Box>

            <Box>
              <Text color="gray">
                {repo.private && '🔒 '}
                updated {formatRelativeTime(repo.pushedAt)}
              </Text>
            </Box>
          </Box>
        );
      })}

      {/* Scroll indicators */}
      {repos.length > maxVisible && (
        <Box paddingTop={1}>
          <Text color="gray">
            {startIndex > 0 ? '↑ ' : '  '}
            {selectedIndex + 1}/{repos.length}
            {startIndex + maxVisible < repos.length ? ' ↓' : '  '}
          </Text>
        </Box>
      )}
    </Box>
  );
}
