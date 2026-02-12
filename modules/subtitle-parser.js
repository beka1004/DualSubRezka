(() => {
  const TIMECODE_SEPARATOR = /\s+-->\s+/;

  const cleanText = (text) =>
    text
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]+\}/g, '')
      .replace(/\r/g, '')
      .trim();

  const parseTimeToMs = (value) => {
    const normalized = value.trim().replace(',', '.');
    const parts = normalized.split(':');

    if (parts.length < 2) return NaN;

    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (parts.length === 3) {
      hours = Number(parts[0]);
      minutes = Number(parts[1]);
      seconds = Number(parts[2]);
    } else {
      minutes = Number(parts[0]);
      seconds = Number(parts[1]);
    }

    if ([hours, minutes, seconds].some((v) => Number.isNaN(v))) return NaN;

    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  };

  const parseBlock = (block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return null;

    let timeLineIndex = lines.findIndex((line) => TIMECODE_SEPARATOR.test(line));
    if (timeLineIndex === -1) return null;

    const [startRaw, endRawWithMeta] = lines[timeLineIndex].split(TIMECODE_SEPARATOR);
    const endRaw = endRawWithMeta.split(/\s+/)[0];

    const start = parseTimeToMs(startRaw);
    const end = parseTimeToMs(endRaw);

    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;

    const textLines = lines.slice(timeLineIndex + 1);
    const text = cleanText(textLines.join('\n'));

    if (!text) return null;

    return { start, end, text };
  };

  const parseVtt = (raw) => {
    const blocks = raw
      .replace(/^WEBVTT[\s\S]*?\n\n/, '')
      .split(/\n\n+/)
      .map(parseBlock)
      .filter(Boolean);

    return blocks;
  };

  const parseSrt = (raw) =>
    raw
      .split(/\n\n+/)
      .map(parseBlock)
      .filter(Boolean);

  const parse = (raw, formatHint = '') => {
    const text = (raw || '').replace(/\r\n/g, '\n');
    if (!text.trim()) return [];

    if (formatHint.includes('.srt')) return parseSrt(text);
    if (formatHint.includes('.vtt')) return parseVtt(text);
    if (text.startsWith('WEBVTT')) return parseVtt(text);

    return parseSrt(text);
  };

  const overlaps = (a, b, toleranceMs) => {
    const latestStart = Math.max(a.start, b.start);
    const earliestEnd = Math.min(a.end, b.end);
    return earliestEnd + toleranceMs >= latestStart;
  };

  const mergeTracks = (ruTrack, enTrack, toleranceMs = 300) => {
    if (!ruTrack.length && !enTrack.length) return [];

    return ruTrack.map((ruItem) => {
      const enItem = enTrack.find((candidate) => overlaps(ruItem, candidate, toleranceMs));
      return {
        start: ruItem.start,
        end: ruItem.end,
        ru: ruItem.text,
        en: enItem?.text || ''
      };
    });
  };

  window.RezkaSubtitleParser = {
    parse,
    mergeTracks
  };
})();
