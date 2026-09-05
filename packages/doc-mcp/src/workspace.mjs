import fs from "node:fs";
import path from "node:path";

import { resolveInWorkspace } from "./config.mjs";

const splitRow = (line) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());

// 구분선 판정은 칸마다 대시 3개 이상을 요구한다 (`|---|` 관례). 대시 1~2개짜리 칸은
// `| - | - |` 같은 정상 데이터 행과 구분할 수 없어 구분선으로 보지 않는다.
const isDivider = (line) => {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|");
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
};

// 마크다운 링크에서 경로만 뽑는다. 링크가 아니면 원문을 돌려준다.
const unlink = (cell) => {
  const match = cell.match(/\]\(([^)]+)\)/);
  return (match ? match[1] : cell).split("#")[0].trim();
};

export function parseTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes("|") || !lines[i + 1] || !isDivider(lines[i + 1])) continue;
    const headers = splitRow(lines[i]);
    const rows = [];
    let cursor = i + 2;
    while (
      cursor < lines.length &&
      lines[cursor].includes("|") &&
      !(lines[cursor + 1] && isDivider(lines[cursor + 1]))
    ) {
      const cells = splitRow(lines[cursor]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] ?? "";
      });
      rows.push(row);
      cursor += 1;
    }
    tables.push({ headers, rows });
    i = cursor - 1;
  }
  return tables;
}

// optionalFieldKeys 에 든 키는 표 선택 조건(모든 헤더 존재)에서 제외한다.
// 값이 있으면 쓰고 없으면 폴백하는 필드(예: counterparties.slug)가 이 표를
// 계속 찾을 수 있게 하기 위함이다.
function readTable(config, section, optionalFieldKeys = []) {
  const absolute = resolveInWorkspace(config, section.path);
  const markdown = fs.readFileSync(absolute, "utf8");
  const wanted = Object.entries(section.fields)
    .filter(([key]) => !optionalFieldKeys.includes(key))
    .map(([, header]) => header);
  const table = parseTables(markdown).find((candidate) =>
    wanted.every((header) => candidate.headers.includes(header))
  );
  if (!table) {
    throw new Error(`설정한 열을 가진 표를 찾지 못했다: ${section.path}`);
  }
  return table;
}

export function readPricing(config) {
  const section = config.pricing;
  const table = readTable(config, section);
  return table.rows.map((row) => ({
    metric: row[section.fields.metric],
    key: row[section.fields.key],
    value: row[section.fields.value],
    source: unlink(row[section.fields.source]),
    verified_at: row[section.fields.verified_at],
  }));
}

export function readIssuer(config) {
  const section = config.contacts;
  const table = readTable(config, section);
  const result = { ...config.issuer };
  for (const [field, label] of Object.entries(section.lookup)) {
    const row = table.rows.find((candidate) => candidate[section.fields.label] === label);
    if (!row || !row[section.fields.value]) {
      throw new Error(`연락처 정본에 「${label}」 값이 없다`);
    }
    result[field] = row[section.fields.value];
  }
  return result;
}

export function readCounterparty(config, slug) {
  const section = config.counterparties;
  const table = readTable(config, section, ["slug"]);
  const row = table.rows.find((candidate) => candidate[section.fields.name] === slug);
  if (!row) {
    throw new Error(`상대를 찾지 못했다: ${slug}`);
  }
  // slug 필드는 선택 사항이다. 설정에 없거나, 표에 그 열이 없거나, 셀이 비어 있으면
  // 지금까지처럼 표시 이름을 폴더명으로 쓴다.
  const slugColumn = section.fields.slug;
  const slugValue = slugColumn ? (row[slugColumn] ?? "").trim() : "";
  const dirName = slugValue || slug;
  return {
    id: row[section.fields.id],
    name: row[section.fields.name],
    stage: row[section.fields.stage],
    dir: resolveInWorkspace(config, path.join(section.dir, dirName)),
  };
}
