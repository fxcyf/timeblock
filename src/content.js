function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function eventContentCategories(contents) {
  return [...new Set(contents.map((content) => cleanText(content.category)).filter(Boolean))];
}

export function favoriteEventContents(contents) {
  return contents.filter((content) => content.favorite === true);
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
  };
  return { content, contents: [...contents, content], created: true };
}
