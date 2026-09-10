# Contributing

价格更新尽量只修改一个 `data/providers/*.json` 文件。

## Provider 格式

```json
{
  "id": "example",
  "name": "Example",
  "website": "https://example.com",
  "currency": "CNY",
  "updated_at": "2026-09-10",
  "source_url": "https://example.com/pricing",
  "models": [
    {
      "model": "gpt-5.6-sol",
      "input": 1,
      "output": 6,
      "cached_input": 0.1
    }
  ]
}
```

规则：

- `currency` 目前只允许 `CNY` / `USD`
- 所有价格均为 `/1M tokens`
- `input`、`output` 必须 >= 0
- `model` 必须存在于 `data/models.json`
- 同一平台不得重复同一模型
- 修改数据后先执行 `npm run check`
