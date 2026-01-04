import React from 'react';
import { Box, Text } from 'ink';
import { getToolColor } from '../utils/colors.js';
import { truncatePath } from '../utils/format.js';
import type { AgentActivityEvent } from '../api/types.js';

interface ActivityLogProps {
  activities: AgentActivityEvent[];
  maxVisible?: number;
}

export function ActivityLog({
  activities,
  maxVisible = 15,
}: ActivityLogProps): React.ReactElement {
  if (activities.length === 0) {
    return (
      <Box paddingY={1}>
        <Text color="gray">Waiting for agent activity...</Text>
      </Box>
    );
  }

  // Show most recent activities
  const visibleActivities = activities.slice(-maxVisible);

  return (
    <Box flexDirection="column">
      {visibleActivities.map((activity, index) => (
        <ActivityItem key={index} activity={activity} />
      ))}
    </Box>
  );
}

interface ActivityItemProps {
  activity: AgentActivityEvent;
}

function ActivityItem({ activity }: ActivityItemProps): React.ReactElement {
  const toolColor = getToolColor(activity.tool);
  const toolLabel = activity.tool.padEnd(6);

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box>
        <Text color="gray">{toolColor(toolLabel)}</Text>
        <Text> </Text>
        <Text>
          {activity.file
            ? truncatePath(activity.file, 50)
            : activity.command || ''}
        </Text>
      </Box>

      {activity.description && (
        <Box paddingLeft={7}>
          <Text color="gray">{activity.description}</Text>
        </Box>
      )}

      {activity.output && (
        <Box paddingLeft={7}>
          <Text color="gray" wrap="truncate">
            {activity.output.slice(0, 100)}
            {activity.output.length > 100 ? '…' : ''}
          </Text>
        </Box>
      )}
    </Box>
  );
}
