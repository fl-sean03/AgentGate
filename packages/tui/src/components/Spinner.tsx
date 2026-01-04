import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import { colors } from '../utils/colors.js';

const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];
const FRAME_INTERVAL = 100;

interface SpinnerProps {
  label?: string;
  color?: 'primary' | 'warning' | 'info';
}

export function Spinner({ label, color = 'primary' }: SpinnerProps): React.ReactElement {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, FRAME_INTERVAL);

    return () => clearInterval(timer);
  }, []);

  const frame = SPINNER_FRAMES[frameIndex] || SPINNER_FRAMES[0];

  const colorFn = {
    primary: colors.primary,
    warning: colors.warning,
    info: colors.info,
  }[color];

  return (
    <Text>
      {colorFn(frame)}
      {label && <Text> {label}</Text>}
    </Text>
  );
}
