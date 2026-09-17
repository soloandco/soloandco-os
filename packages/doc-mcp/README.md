# business-doc-mcp

워크스페이스의 마크다운 표를 읽어 견적서를 만드는 로컬 MCP 서버다. 데이터는 전부 로컬에 저장된다. 외부로 전송되지 않는다.

## 설치

생성기와 달리 이 서버는 외부 패키지가 필요하다. 저장소 루트에서 한 번 실행한다.

```bash
npm install
```

설치하지 않고 실행하면 `ERR_MODULE_NOT_FOUND` 오류로 멈춘다.

## 설정

`config.example.json`을 `config.json`으로 복사하고 `workspace_root`를 실제 워크스페이스 경로로 채운다.

`config.example.json`의 `pricing.path`·`contacts.path`·`counterparties.path`·`counterparties.dir` 값은 예시일 뿐이다. 이 저장소의 생성기는 그 경로들을 만들지 않으므로, 실제로 그 표들이 있는 워크스페이스 파일 경로로 다시 지정해야 한다.

`contacts.lookup` 맵의 키는 정확히 `person`과 `email`이어야 한다(견적서 템플릿이 이 두 키만 읽는다). 값(오른쪽)만 워크스페이스마다 다른 표 라벨이다.

`counterparties.fields.slug`는 선택 항목이다. 파이프라인 표에서 폴더명을 담은 열이 따로 있으면 그 열 이름을 지정한다. 지정하지 않거나, 표에 그 열이 없거나, 셀이 비어 있으면 지금처럼 상대의 표시 이름을 그대로 폴더명으로 쓴다.

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

## 라이선스

이 패키지는 AGPL-3.0-only이다. 저장소의 나머지 부분은 Apache-2.0이다.
