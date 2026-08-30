export function gridCellAtPoint({ x, width, hour }) {
  const safeHour = Math.max(0, Math.min(23, Math.trunc(hour)));
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const quarter = Math.max(0, Math.min(3, Math.floor((Math.max(0, Math.min(safeWidth, x)) / safeWidth) * 4)));
  return safeHour * 60 + quarter * 15;
}

export function gridSelectionRange(anchor, current) {
  const start = Math.max(0, Math.min(1425, Math.min(anchor, current)));
  const lastCell = Math.max(0, Math.min(1425, Math.max(anchor, current)));
  return { start, end: Math.min(1440, lastCell + 15) };
}

export function splitBlockIntoHourSegments(block) {
  const segments = [];
  for (let cursor = block.start; cursor < block.end;) {
    const hour = Math.floor(cursor / 60);
    const hourEnd = Math.min(block.end, (hour + 1) * 60);
    segments.push({
      blockId: block.id,
      hour,
      start: cursor - hour * 60,
      end: hourEnd - hour * 60,
      first: cursor === block.start,
      last: hourEnd === block.end,
    });
    cursor = hourEnd;
  }
  return segments;
}
