const u = 'https://www.kosac.re.kr/menus/274/bns';
const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' } });
const h = await r.text();
console.log('STATUS', r.status, 'LEN', h.length);
const i = h.search(/20\d\d[.\-]\d\d[.\-]\d\d/);
console.log('=== LIST AROUND FIRST DATE ===');
console.log(h.slice(Math.max(0, i - 3000), i + 3000));
const hrefs = [...h.matchAll(/href="([^"]*bns[^"]*)"/g)].map((m) => m[1]);
console.log('=== BNS HREFS ===', [...new Set(hrefs)].slice(0, 30).join('\n'));
const pag = [...h.matchAll(/href="([^"]*page[^"]*)"/gi)].map((m) => m[1]);
console.log('=== PAGE HREFS ===', [...new Set(pag)].slice(0, 10).join('\n'));
const first = [...new Set(hrefs)].find((x) => /bns\/\d+/.test(x));
if (first) {
  const d = await (await fetch(new URL(first, u), { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
  const j = d.search(/접수|기간|신청/);
  console.log('=== DETAIL', first, 'LEN', d.length, '===');
  console.log(d.slice(Math.max(0, j - 2500), j + 2500));
}
