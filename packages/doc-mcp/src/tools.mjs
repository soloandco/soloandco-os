import { createQuote } from "./quote.mjs";
import { readCounterparty, readPricing } from "./workspace.mjs";

export const TOOL_LIST = [
  {
    name: "get_pricing",
    description: "워크스페이스 수치 등록부에서 정책 수치를 값·정본 경로·확인일과 함께 읽는다.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_counterparty",
    description: "파이프라인에서 상대의 식별자·이름·단계와 저장 폴더를 읽는다.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "파이프라인 표의 상대 이름" } },
      required: ["slug"],
    },
  },
  {
    name: "create_quote",
    description: "A4 HTML 견적서를 만들어 상대 폴더에 저장하고 경로를 돌려준다. 문구 작성은 하지 않는다.",
    inputSchema: {
      type: "object",
      properties: {
        counterparty: { type: "string", description: "파이프라인 표의 상대 이름" },
        items: {
          type: "array",
          description: "견적 항목",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              amount: { type: "number" },
              note: { type: "string" },
            },
            required: ["label", "amount"],
          },
        },
        valid_days: { type: "number", description: "유효기간 일수 (기본 30)", default: 30 },
      },
      required: ["counterparty", "items"],
    },
  },
];

const text = (body) => ({ content: [{ type: "text", text: body }] });
const fail = (body) => ({ content: [{ type: "text", text: body }], isError: true });

export async function dispatch(config, name, rawArgs) {
  const args = rawArgs ?? {};
  try {
    switch (name) {
      case "get_pricing": {
        const rows = readPricing(config);
        const body = rows
          .map((row) => `${row.metric}: ${row.value} (정본 ${row.source}, 확인 ${row.verified_at})`)
          .join("\n");
        return text(body || "등록된 정책 수치가 없다");
      }
      case "get_counterparty": {
        const found = readCounterparty(config, String(args.slug ?? ""));
        return text(`${found.name} / ${found.id} / 단계 ${found.stage} / 저장 폴더 ${found.dir}`);
      }
      case "create_quote": {
        const result = createQuote(config, {
          counterparty: String(args.counterparty ?? ""),
          items: Array.isArray(args.items) ? args.items : [],
          valid_days: Number.isFinite(args.valid_days) ? args.valid_days : 30,
        });
        return text(`견적서 저장됨\n경로: ${result.path}\n합계: ${result.total.toLocaleString("en-US")}`);
      }
      default:
        return fail(`알 수 없는 도구: ${name}`);
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
