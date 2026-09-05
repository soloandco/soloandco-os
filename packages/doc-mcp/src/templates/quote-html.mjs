const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);

const money = (amount) => Number(amount).toLocaleString("en-US");

const hexOr = (value, fallback, name) => {
  if (!value) return fallback;
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
    throw new Error(`brand.${name} 는 #RRGGBB 형식이어야 한다`);
  }
  return value;
};

const fontOr = (value, fallback) => {
  if (!value) return fallback;
  if (/[<>{};]/.test(value)) {
    throw new Error("brand.font_family 에 쓸 수 없는 문자가 있다");
  }
  return value;
};

export function renderQuoteHtml(model) {
  const accent = hexOr(model.brand?.accent, "#111111", "accent");
  const ink = hexOr(model.brand?.ink, "#111111", "ink");
  const font = fontOr(model.brand?.font_family, "sans-serif");
  const taxed = Boolean(model.issuer.business_number);

  const rows = model.items
    .map(
      (item) =>
        `<tr><td>${escape(item.label)}</td><td class="note">${escape(item.note)}</td>` +
        `<td class="num">${money(item.amount)}</td></tr>`
    )
    .join("");

  const issuerLines = [
    escape(model.issuer.display_name),
    taxed ? `사업자등록번호 ${escape(model.issuer.business_number)}` : "",
    escape(model.issuer.person),
    escape(model.issuer.email),
  ]
    .filter(Boolean)
    .map((line) => `<div>${line}</div>`)
    .join("");

  const totalLabel = taxed ? "합계 (부가세 별도)" : "합계";

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>견적서 ${escape(model.counterparty.name)}</title>
<style>
:root{ --accent:${accent}; --ink:${ink}; --line:#e6e6e6; --mid:#555555; }
@page{ size: A4; margin: 24mm 22mm; }
*{ box-sizing:border-box; }
body{ margin:0; font-family:${font}; color:var(--ink); font-size:10.5pt; line-height:1.6; }
h1{ font-size:20pt; margin:0 0 4mm; color:var(--accent); letter-spacing:-0.01em; }
.meta{ color:var(--mid); font-size:9.5pt; }
.parties{ display:flex; gap:12mm; margin:10mm 0 8mm; }
.parties > div{ flex:1; }
.label{ font-size:9pt; color:var(--mid); margin-bottom:2mm; }
table{ width:100%; border-collapse:collapse; margin-top:4mm; }
th,td{ padding:3mm 2mm; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
th{ font-size:9pt; color:var(--mid); font-weight:600; }
.num{ text-align:right; white-space:nowrap; }
.note{ color:var(--mid); font-size:9.5pt; }
tfoot td{ border-bottom:none; border-top:2px solid var(--accent); font-weight:700; font-size:12pt; padding-top:4mm; }
</style>
</head>
<body>
<h1>견적서</h1>
<div class="meta">발행일 ${escape(model.issued_on)} · 유효기간 ${escape(model.valid_until)}까지</div>
<div class="parties">
  <div><div class="label">받는 곳</div><div>${escape(model.counterparty.name)} 귀중</div></div>
  <div><div class="label">보내는 곳</div>${issuerLines}</div>
</div>
<table>
  <thead><tr><th>항목</th><th>내용</th><th class="num">금액 (원)</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td>${totalLabel}</td><td></td><td class="num">${money(model.total)}</td></tr></tfoot>
</table>
</body>
</html>
`;
}
