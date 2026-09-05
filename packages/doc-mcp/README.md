# business-doc-mcp

워크스페이스의 마크다운 표를 읽어 견적서를 만드는 로컬 MCP 서버다. 데이터는 전부 로컬에 저장된다. 외부로 전송되지 않는다.

## 설정

`config.example.json`을 `config.json`으로 복사하고 `workspace_root`를 실제 워크스페이스 경로로 채운다.

## MCP 클라이언트 등록

```json
{
  "mcpServers": {
    "business-doc-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/packages/doc-mcp/src/server.mjs"],
      "env": { "DOC_MCP_CONFIG": "/absolute/path/to/config.json" }
    }
  }
}
```

## 도구

| 이름 | 설명 |
|---|---|
| `get_pricing` | 수치 등록부에서 정책 수치를 값·정본 경로·확인일과 함께 읽는다 |
| `get_counterparty` | 파이프라인에서 상대의 식별자·이름·단계와 저장 폴더를 읽는다 |
| `create_quote` | A4 HTML 견적서를 만들어 상대 폴더에 저장하고 경로를 돌려준다 |
