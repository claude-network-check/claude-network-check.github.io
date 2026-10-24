# Claude Network Check

一个已部署到 GitHub Pages 的浏览器网络检测页，附 5 步图文教程和 Agent Skill。独立项目，与 Anthropic / Claude / IPPure 无关联。

- 打开即检测，顶部给出结论（良好 / 注意 / 高风险）和按优先级排序的修复建议。
- **Claude 出口**：claude.ai 与 claude.com 的出口 IP、耗时、Cloudflare 节点，按 Claude 前端自己返回的国家代码判断是否在支持地区；IP 类型（机房 / 住宅）与 VPN、代理、Tor 标记；普通网页 IPv4 / IPv6 出口一致性。
- **DNS 泄露**：Surfshark、Fastly、BrowserLeaks 共 16 次随机子域名查询，出现中国大陆解析器即判为泄露。
- **WebRTC 泄露**：同时连接 B 站、小米、芒果 TV、Cloudflare、Google 的 STUN，能发现国内域名直连时暴露的真实 IP。
- **中文环境评分**：时区、语言、字体、Intl、UTC 偏移、系统风格六项加权，算法与 [IPPure](https://ippure.com/claude) 一致，同一浏览器分数相同。
- **一致性与设备**：浏览器时区与出口 IP 时区、系统 / 浏览器、WebGL、自动化标记。
- 无后端、无 API 密钥、无统计脚本；可一键隐藏 IP，复制的报告不含 IP。免费服务失败时显示“未知”，不当作通过。

**在线检测：[claude-network-check.github.io](https://claude-network-check.github.io/)** · [配置教程](https://claude-network-check.github.io/guide.html) · [下载 Skill](https://claude-network-check.github.io/downloads/claude-network-setup.zip)

![检测页预览](docs/images/03-preview.png)

教程包含准备清单、连接流程图、五步目录、可复制配置片段与逐步验证要点。

![五步配置教程预览](docs/images/04-guide-preview.png)

## 本地运行

需要 Node.js 22 或更新版本，无需安装依赖。

```bash
npm test
npm run build
npm run dev
```

打开 http://127.0.0.1:4173 。开发服务器仅绑定回环地址；修改后重新 build 并刷新。

## 内容

- [简短图文教程](docs/guide.zh-CN.md)
- [与 IPPure、net.coffee 逐项对照](docs/coverage.zh-CN.md)
- [检测方法与免费数据源](docs/research.zh-CN.md)
- [实现与浏览器测试记录](docs/validation.md)
- [Skill](skills/claude-network-setup/SKILL.md) / [Mihomo 模板](skills/claude-network-setup/assets/mihomo.template.yaml)
- [推文草稿](docs/thread.zh-CN.md)
- [SEO 维护说明](docs/seo.md)

构建生成 dist/，包含网页、可阅读的教程/调研页、原始文档、Skill 和下载 ZIP。Skill 解压后，将 claude-network-setup 文件夹放入你的 Agent 支持的 skills 目录，显式调用 `$claude-network-setup`。技能不会随网页运行。

## 发布到 GitHub Pages

默认部署地址：https://claude-network-check.github.io/

部署到自己的账号或组织时：

1. 自行创建 GitHub 仓库并推送此项目。
2. Settings → Pages → Source 选择 GitHub Actions。
3. 推送到 main，或在 Actions 手动运行 Deploy Pages 工作流。
4. 使用不同地址时，在构建步骤设置 `SITE_URL=https://你的域名/路径/`，使 canonical、社交分享链接和 sitemap 与部署地址一致。

工作流在 main 推送时自动发布，也支持手动触发。资源路径支持 /仓库名/ 子目录，无后端和密钥。免费 API 的共享额度可能不适合大流量，详见[检测方法](docs/research.zh-CN.md)。

## 实现

site/ 使用原生 HTML、CSS 与 ES Modules（`sources.js` 数据源、`assess.js` 判定、`local.js` 本地信号、`app.js` 渲染）；scripts/ 提供静态构建、ZIP 打包和本地服务器。测试用 Node 内置 test runner。无运行依赖、无外部字体、无统计脚本。

请勿将节点凭据、订阅地址、原始检测结果、本机路径或私人截图提交到仓库。许可证只覆盖本项目，不授予第三方 API 的额外使用权。
