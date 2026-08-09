import { Easing, interpolate } from "remotion";

const soft = Easing.bezier(0.16, 1, 0.3, 1);

export function fadeUp(
  frame: number,
  start: number,
  duration = 18
): { opacity: number; translateY: number } {
  const opacity = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: soft,
  });
  const translateY = interpolate(frame, [start, start + duration], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: soft,
  });
  return { opacity, translateY };
}

export function fadeIn(
  frame: number,
  start: number,
  duration = 16
): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: soft,
  });
}

export function fadeOut(
  frame: number,
  start: number,
  duration = 12
): number {
  return interpolate(frame, [start, start + duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: soft,
  });
}
