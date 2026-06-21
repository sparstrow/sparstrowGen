export interface Chunk {
  index: number;
  heading: string | null;
  text: string;
}

const TARGET_CHARS = 1600; // ≈400 tokens
const OVERLAP_CHARS = 200;

/**
 * Split a markdown body into indexable chunks: sections by ## headings,
 * long sections by paragraph windows with overlap.
 */
export function chunkMarkdown(body: string): Chunk[] {
  const sections: { heading: string | null; text: string }[] = [];
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text.length > 0) sections.push({ heading: currentHeading, text });
    buffer = [];
  };

  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^##+\s+(.+)$/);
    if (match) {
      flush();
      currentHeading = match[1]?.trim() ?? null;
    }
    buffer.push(line);
  }
  flush();

  const chunks: Chunk[] = [];
  for (const section of sections) {
    if (section.text.length <= TARGET_CHARS) {
      chunks.push({ index: chunks.length, heading: section.heading, text: section.text });
      continue;
    }
    const paragraphs = section.text.split(/\n{2,}/);
    let window = "";
    for (const para of paragraphs) {
      if (window.length > 0 && window.length + para.length + 2 > TARGET_CHARS) {
        chunks.push({ index: chunks.length, heading: section.heading, text: window.trim() });
        window = window.slice(-OVERLAP_CHARS);
      }
      window = window.length > 0 ? `${window}\n\n${para}` : para;
      // Hard split for pathological single paragraphs.
      while (window.length > TARGET_CHARS * 1.5) {
        chunks.push({
          index: chunks.length,
          heading: section.heading,
          text: window.slice(0, TARGET_CHARS).trim(),
        });
        window = window.slice(TARGET_CHARS - OVERLAP_CHARS);
      }
    }
    if (window.trim().length > 0) {
      chunks.push({ index: chunks.length, heading: section.heading, text: window.trim() });
    }
  }
  return chunks.filter((c) => c.text.length > 0);
}
