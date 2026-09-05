import fs from "node:fs";
import path from "node:path";

import { resolveInWorkspace } from "./config.mjs";
import { renderQuoteHtml } from "./templates/quote-html.mjs";
import { readCounterparty, readIssuer } from "./workspace.mjs";

const TODAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = (date) => date.toISOString().slice(0, 10);

// 기본값은 로컬 달력 날짜로 계산한다. toISOString()은 UTC라 UTC+9에서
// 자정 근처(00~08시)에는 날짜가 하루 당겨진다.
const localIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (isoString, days) => {
  const base = new Date(`${isoString}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return isoDate(base);
};

export function createQuote(config, input) {
  const items = input.items ?? [];
  if (items.length === 0) {
    throw new Error("항목이 최소 하나 있어야 한다");
  }
  for (const item of items) {
    if (!Number.isFinite(item.amount) || item.amount <= 0) {
      throw new Error("금액은 0보다 큰 숫자여야 한다");
    }
  }
  if (input.today !== undefined && !TODAY_PATTERN.test(input.today)) {
    throw new Error("today 형식이 올바르지 않다: YYYY-MM-DD 여야 한다");
  }

  const counterparty = readCounterparty(config, input.counterparty);
  const issuer = readIssuer(config);
  const issuedOn = input.today ?? localIsoDate(new Date());
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  const html = renderQuoteHtml({
    issuer,
    counterparty,
    items: items.map((item) => ({ label: item.label, amount: item.amount, note: item.note ?? "" })),
    total,
    issued_on: issuedOn,
    valid_until: addDays(issuedOn, input.valid_days ?? 30),
    brand: config.brand ?? {},
  });

  const filename = config.output.filename
    .replace("{name}", counterparty.name)
    .replace("{date}", issuedOn);
  const rawTarget = path.join(counterparty.dir, filename);
  // 쓰기 대상은 디렉터리가 이미 검증됐다고 가정하지 않고, 최종 경로 자체를
  // 워크스페이스 경계에 다시 통과시킨다 (파일명에 섞여 들어온 값도 여기서 걸린다).
  const target = resolveInWorkspace(config, path.relative(config.workspace_root, rawTarget));

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");

  return { path: target, total, counterparty: counterparty.name };
}
