/** Create a local Word transcript from all entries, independently of display filters. */
export async function createTranscriptDocx({ title, provenance = '', entries = [], screenshots = [] }) {
  const { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } = await import('docx');
  const paragraphs = (text) => String(text || '').split(/\r?\n/).map((line) => new Paragraph({ children: [new TextRun(line)] }));
  const children = [new Paragraph({ text: title || 'Transcript', heading: HeadingLevel.TITLE }), ...paragraphs(provenance)];
  const shots = new Map(screenshots.map((shot) => [shot.id, shot]));
  const used = new Set();
  function appendScreenshot(shot) {
    if (!shot || used.has(shot.id)) return;
    used.add(shot.id);
    const width = Math.max(1, shot.width || 576);
    const height = Math.max(1, shot.height || 324);
    // Fit both portrait and landscape images inside a normal page, without distortion.
    const scale = Math.min(1, 576 / width, 624 / height);
    const description = shot.ocrText || `Screenshot captured ${shot.timestamp}`;
    children.push(new Paragraph({ children: [new ImageRun({
      data: shot.data, type: 'png',
      transformation: { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) },
      altText: { title: 'Transcript screenshot', name: 'Transcript screenshot', description },
    })] }), new Paragraph({ children: [new TextRun({ text: `Screenshot captured ${shot.timestamp}`, italics: true })] }));
    if (shot.ocrText) children.push(...paragraphs(`Screenshot text: ${shot.ocrText}`));
  }
  for (const entry of entries) {
    children.push(new Paragraph({ text: entry.heading, heading: HeadingLevel.HEADING_1 }), ...paragraphs(entry.text));
    if (entry.source === 'screen') appendScreenshot(shots.get(entry.screenshotId));
  }
  const remaining = screenshots.filter((shot) => !used.has(shot.id));
  if (remaining.length) {
    children.push(new Paragraph({ text: 'Additional screenshots', heading: HeadingLevel.HEADING_1 }));
    remaining.forEach(appendScreenshot);
  }
  return Packer.toBlob(new Document({
    creator: 'CallScribe', title: title || 'Transcript',
    styles: {
      default: { document: { run: { font: 'Arial', size: 22, color: '111111' }, paragraph: { spacing: { after: 120, line: 276 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 36, bold: true, color: '000000' }, paragraph: { spacing: { after: 240 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 26, bold: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, children }],
  }));
}
