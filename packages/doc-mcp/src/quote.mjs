import fs from "node:fs";
import path from "node:path";

import { renderQuoteHtml } from "./templates/quote-html.mjs";
import { readCounterparty, readIssuer } from "./workspace.mjs";

const isoDate = (date) => date.toISOString().slice(0, 10);

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

  const counterparty = readCounterparty(config, input.counterparty);
  const issuer = readIssuer(config);
  const issuedOn = input.today ?? isoDate(new Date());
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
  const target = path.join(counterparty.dir, filename);

  fs.mkdirSync(counterparty.dir, { recursive: true });
  fs.writeFileSync(target, html, "utf8");

  return { path: target, total, counterparty: counterparty.name };
}
