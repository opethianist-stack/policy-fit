import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { buildDraft } from '../../../lib/draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FONT = '맑은 고딕';
const INK = '191F28', MUTED = '66717E', LINE = 'D5D9E0', TINT = 'F3F4F6';
const CONTENT_W = 9026; // A4, 좌우 여백 1440 DXA

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 20, color: INK, ...o });
const para = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: 100, line: 320 }, ...o });
const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };
// 셀 글자 속 줄바꿈(\n)은 줄을 나눈다
const lines = (text, o) => String(text || '').split('\n').map((t, i) => run(t, { size: 18, ...o, ...(i ? { break: 1 } : {}) }));
const cell = (text, width, o = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA }, borders, columnSpan: o.span,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  shading: o.head ? { type: ShadingType.CLEAR, fill: TINT, color: 'auto' } : undefined,
  children: [para(lines(text, { bold: !!o.head || !!o.bold }), { spacing: { after: 0, line: 280 } })],
});
const table = (rows, widths, headFirstCol, headRow) => new Table({
  width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
  rows: rows.map((r, ri) => new TableRow({ children: r.map((t, ci) => cell(t, widths[ci], { head: (headRow && ri === 0) || (headFirstCol && ci === 0) })) })),
});

function argument(b) {
  const out = [para([
    run(`${b.mark}. (${b.label}) `, { bold: true, size: 22 }),
    ...(b.headline ? [run(b.headline, { bold: true, size: 22 })] : []),
  ], { spacing: { before: 200, after: 100, line: 320 } })];
  for (const x of b.bullets) {
    out.push(para([
      run('- '),
      run(x.quoted ? `“${x.text}”` : x.text),
      ...(x.cite ? [run(` ${x.cite}`, { color: MUTED, size: 18 })] : []),   // 한 카드가 여러 불릿이면 마지막 불릿에만 출처
    ], { indent: { left: 440, hanging: 200 }, spacing: { after: 80, line: 320 } }));
  }
  return out;
}

function grid(b) {
  const w = b.widths;
  const rows = [
    new TableRow({ tableHeader: true, children: b.header.map((t, i) => cell(t, w[i], { head: true })) }),
    ...b.rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, w[i], { head: i === 0 })) })),
  ];
  if (b.foot) rows.push(new TableRow({ children: [cell(b.foot[0], w[0], { head: true }), cell(b.foot[1], w[1] + w[2], { span: 2, bold: true })] }));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: w, rows });
}

function render(draft) {
  const out = [
    para(run(draft.title, { size: 32, bold: true }), { spacing: { after: 60 } }),
    para(run(draft.subtitle, { size: 22, color: MUTED }), { spacing: { after: 320 } }),
  ];
  for (const s of draft.sections) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 140 }, children: [run(s.heading, { size: 26, bold: true })] }));
    for (const b of s.blocks) {
      if (b.type === 'argument') out.push(...argument(b));
      if (b.type === 'grid') out.push(grid(b));
      if (b.type === 'table') out.push(table(b.rows, [2200, CONTENT_W - 2200], true, false));
      if (b.type === 'flow') out.push(para(b.nodes.flatMap((n, i) => [
        ...(i ? [run('  →  ', { color: MUTED })] : []), run(n.name, { bold: true }), run(` (${n.role})`, { color: MUTED, size: 18 }),
      ]), { spacing: { before: 160, after: 100 } }));
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
