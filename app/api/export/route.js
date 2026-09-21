import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { buildDraft } from '../../../lib/draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FONT = '맑은 고딕';
const INK = '191F28', MUTED = '66717E', LINE = 'D5D9E0', TINT = 'F3F4F6', ACCENT = '524FA1';
const CONTENT_W = 9026; // A4, 좌우 여백 1440 DXA

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 20, color: INK, ...o });
const para = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: 100, line: 320 }, ...o });
const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (text, width, o = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA }, borders,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  shading: o.head ? { type: ShadingType.CLEAR, fill: TINT, color: 'auto' } : undefined,
  children: [para(run(text, { size: 18, bold: !!o.head }), { spacing: { after: 0, line: 280 } })],
});
const table = (rows, widths, headFirstCol, headRow) => new Table({
  width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
  rows: rows.map((r, ri) => new TableRow({ children: r.map((t, ci) => cell(t, widths[ci], { head: (headRow && ri === 0) || (headFirstCol && ci === 0) })) })),
});

function render(draft) {
  const out = [
    para(run(draft.title, { size: 32, bold: true }), { spacing: { after: 60 } }),
    para(run(draft.subtitle, { size: 22, color: MUTED }), { spacing: { after: 320 } }),
  ];
  for (const s of draft.sections) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 140 }, children: [run(s.heading, { size: 26, bold: true })] }));
    for (const b of s.blocks) {
      if (b.type === 'table') out.push(table(b.rows, [2200, CONTENT_W - 2200], true, false));
      if (b.type === 'grid') out.push(table([b.header, ...b.rows], [1600, 3300, CONTENT_W - 4900], false, true));
      if (b.type === 'flow') out.push(para(b.nodes.flatMap((n, i) => [
        ...(i ? [run('  →  ', { color: MUTED })] : []), run(n.name, { bold: true }), run(` (${n.role})`, { color: MUTED, size: 18 }),
      ])));
      if (b.type === 'note') out.push(para(run(b.text, { size: 16, color: MUTED })));
      if (b.type === 'subheading') out.push(para(run(b.text, { size: 22, bold: true, color: ACCENT }), { spacing: { before: 200, after: 100 } }));
      if (b.type === 'evidence') {
        out.push(para([run(`[근거 ${b.no}] `, { bold: true }), run(b.source, { bold: true })], { spacing: { before: 120, after: 60 } }));
        out.push(para(run(`“${b.quote}”`), { indent: { left: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: LINE, space: 10 } } }));
        if (b.logic) out.push(para([run('사업 연결  ', { bold: true, size: 18, color: MUTED }), run(b.logic)], { indent: { left: 360 }, spacing: { after: 160, line: 320 } }));
      }
    }
  }
  return out;
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: '요청 본문이 JSON이 아닙니다.' }, { status: 400 }); }
  if (!body || !body.notice || !Array.isArray(body.cards)) return Response.json({ ok: false, error: 'notice와 cards가 필요합니다.' }, { status: 400 });

  const draft = buildDraft(body);
  if (!draft.stats.adopted) return Response.json({ ok: false, error: '원문 대조를 통과한 근거가 없습니다.' }, { status: 422 });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })] })] }) },
      children: render(draft),
    }],
  });
  const buf = await Packer.toBuffer(doc);
  const name = encodeURIComponent(`사업이해도_${body.notice.no || 'draft'}.docx`);
  return new Response(buf, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename*=UTF-8''${name}`,
      'x-blocked-count': String(draft.stats.blocked),
    },
  });
}
