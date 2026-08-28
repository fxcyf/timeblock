export function hasMovedBeyondTolerance(start, current, tolerance = 8) {
  if (!start || !current || tolerance < 0) return true;
  return Math.hypot(current.x - start.x, current.y - start.y) > tolerance;
}
