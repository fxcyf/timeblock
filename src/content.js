function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function eventContentCategories(contents) {
  return [...new Set(contents.map((content) => cleanText(content.category)).filter(Boolean))];
}

export function favoriteEventContents(contents) {
  return contents
    .filter((content) => content.favorite === true)
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
}

export function colorForEventContent(contents, category, palette) {
  const normalizedCategory = cleanText(category);
  const matchingCategory = normalizedCategory
    ? contents.find((content) => cleanText(content.category) === normalizedCategory && palette.includes(content.color))
    : null;
  return matchingCategory?.color || palette[contents.length % palette.length];
}

export function upsertEventContent(contents, draft) {
  const title = cleanText(draft.title);
  if (!title) return null;
  const category = cleanText(draft.category) || null;
  const existingIndex = contents.findIndex((content) => (
    cleanText(content.title).toLocaleLowerCase() === title.toLocaleLowerCase()
    && (cleanText(content.category) || null) === category
  ));

  if (existingIndex >= 0) {
    const content = {
      ...contents[existingIndex],
      favorite: contents[existingIndex].favorite === true || draft.favorite === true,
    };
    return {
      content,
      contents: contents.map((item, index) => index === existingIndex ? content : item),
      created: false,
    };
  }

  const content = {
    id: draft.id,
    title,
    category,
    favorite: draft.favorite === true,
    color: draft.color,
    sortOrder: Number.isInteger(draft.sortOrder) ? draft.sortOrder : contents.length,
  };
  return { content, contents: [...contents, content], created: true };
}

export function removeEventContent(contents, id) {
  return contents
    .filter((content) => content.id !== id)
    .map((content, index) => ({ ...content, sortOrder: index }));
}

export function moveEventContent(contents, id, direction) {
  const ordered = [...contents].sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
  const index = ordered.findIndex((content) => content.id === id);
  if (index < 0) return ordered;
  const peers = ordered.map((content, peerIndex) => ({ content, peerIndex }))
    .filter(({ content }) => content.favorite === ordered[index].favorite);
  const peerPosition = peers.findIndex(({ peerIndex }) => peerIndex === index);
  const targetPeer = Math.max(0, Math.min(peers.length - 1, peerPosition + Math.sign(direction)));
  const target = peers[targetPeer].peerIndex;
  if (target !== index) [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered.map((content, sortOrder) => ({ ...content, sortOrder }));
}

export function updateEventContent(contents, id, draft) {
  const contentIndex = contents.findIndex((content) => content.id === id);
  const title = cleanText(draft.title);
  if (contentIndex < 0 || !title) return null;

  const category = cleanText(draft.category) || null;
  const duplicate = contents.some((content, index) => (
    index !== contentIndex
    && cleanText(content.title).toLocaleLowerCase() === title.toLocaleLowerCase()
    && (cleanText(content.category) || null) === category
  ));
  if (duplicate) return null;

  const content = {
    ...contents[contentIndex],
    title,
    category,
    favorite: draft.favorite === true,
    color: draft.color || contents[contentIndex].color,
  };
  return {
    content,
    contents: contents.map((item, index) => index === contentIndex ? content : item),
  };
}
