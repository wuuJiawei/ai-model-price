# AI Model Price

一个开源的 AI API 模型价格比价站。第一版只做一件事：**把不同平台的同一模型价格放到一起，统一币种后直接比较。**

## 当前能力

- 平台价格数据使用固定 JSON 格式维护
- 模型名称统一，避免同一模型出现多个别名
- 自动校验 PR 中的数据格式、模型 ID、币种和价格
- 自动换算 CNY / USD
- 自动计算 `1M 输入 + 1M 输出` 综合成本与排名
- GitHub Pages 自动部署
- 已预留 `history/`，后续可直接增加价格趋势图

## 本地运行

```bash
npm run check
python3 -m http.server 8080 -d site
```

打开 `http://localhost:8080`。

## 更新价格

编辑或新增：

```text
data/providers/<provider>.json
```

然后执行：

```bash
npm run check
```

提交 PR 后 GitHub Actions 会自动校验。

## 数据原则

1. 价格单位统一为 `/1M tokens`。
2. 保留平台原始币种，不在源数据里手工换汇。
3. `updated_at` 必填。
4. 有公开来源时填写 `source_url`；截图或人工核对可暂时留空。
5. 模型必须引用 `data/models.json` 中的 canonical id。

## Roadmap

- PR Body 固定格式自动生成/更新 provider 文件
- 历史价格快照与折线图
- SLA / 延迟 / 吞吐比价
- 优惠倍率、充值倍率
- 模型真实性与渠道类型标记
- 自动汇率更新

MIT
