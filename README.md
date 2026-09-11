# AI Model Price

一个开源的 AI API 模型价格比价站：把不同平台的同一模型价格放到一起，统一口径后直接比较。

## 当前能力

- 平台价格数据使用固定 JSON 格式维护
- 模型名称统一，避免同一模型出现多个别名
- 自动校验 PR 中的数据格式、模型 ID、币种和价格
- 自动换算 CNY / USD
- 自动计算 `1M 输入 + 1M 输出` 综合成本与排名
- 展示数据更新日期、中转站网址和待录入价格平台
- React + Vite 前端，交互与动效使用 [beUI](https://beui.dev/) 的组件/交互模式
- GitHub Pages / Cloudflare Pages 自动部署
- 已预留 `history/`，后续可增加价格趋势图

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

输出目录为 `site/`。

## Cloudflare Pages

推荐直接使用 Cloudflare Pages 的 GitHub 集成：

1. Cloudflare → Workers & Pages → Create application → Pages → Connect to Git。
2. 选择 `wuuJiawei/ai-model-price`。
3. Production branch：`main`。
4. Build command：`npm run build`。
5. Build output directory：`site`。
6. 部署成功后在 Custom domains 中添加自己的域名或子域名。

仓库同时提供 `wrangler.jsonc`，也可以使用 Wrangler 部署。

## 更新价格

编辑或新增：

```text
data/providers/<provider>.json
```

然后执行：

```bash
npm run build
```

提交 PR 后 GitHub Actions 会自动校验。

### 已知平台但价格待录入

```json
{
  "id": "example",
  "name": "Example",
  "website": "https://example.com",
  "currency": null,
  "updated_at": "2026-09-10",
  "source_url": "https://example.com/pricing",
  "status": "pending",
  "note": "价格正在努力登记中",
  "models": []
}
```

## 数据原则

1. 已录入价格统一为 `/1M tokens`。
2. 保留平台原始币种，不在源数据里手工换汇。
3. `updated_at` 必填，页面会展示最新数据更新日期。
4. 有公开来源时填写 `source_url`；截图或人工核对可暂时留空。
5. 模型必须引用 `data/models.json` 中的 canonical id。
6. `pending` 平台允许暂时没有价格，但必须提供网址。

## 平台目录来源

部分待录入中转站来自 [CC Switch](https://github.com/farion1231/cc-switch) README 的公开赞助商目录，仅用于建立待核价清单；价格会单独核验后再进入正式排名。

## Roadmap

- PR Body 固定格式自动生成/更新 provider 文件
- 历史价格快照与折线图
- SLA / 延迟 / 吞吐比价
- 优惠倍率、充值倍率
- 模型真实性与渠道类型标记
- 自动汇率更新

MIT
