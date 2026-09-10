# Contributing

价格更新尽量只修改一个 `data/providers/*.json` 文件。

## 已有价格 Provider 格式

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

## 待录入价格 Provider 格式

```json
{
  "id": "example-pending",
  "name": "Example Pending",
  "website": "https://example.com",
  "currency": null,
  "updated_at": "2026-09-10",
  "source_url": "https://example.com",
  "status": "pending",
  "note": "价格正在努力登记中",
  "models": []
}
```

规则：

- `currency` 已录价平台仅允许 `CNY` / `USD`
- 所有已录入价格均为 `/1M tokens`
- `input`、`output` 必须 >= 0
- `model` 必须存在于 `data/models.json`
- 同一平台不得重复同一模型
- `pending` 平台允许 `currency: null` 和空 `models`
- `website`、`source_url` 如填写必须是 `http/https`
- 修改数据后先执行 `npm run check`
