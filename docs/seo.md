# SEO 维护

正式站点：https://claude-network-check.github.io/

## 页面分工

| 页面 | 搜索需求 | 内容 |
| --- | --- | --- |
| 首页 | Claude 环境检测、DNS / WebRTC 检测 | 检测入口、22 项能力说明、常见问题 |
| guide.html | Claude 网络配置、Mihomo TUN 规则 | 五步教程、配置下载、验证入口 |
| research.html | 网络检测原理、免费 IP / DNS API | 数据来源、配额和技术边界 |
| coverage.html | 检测范围、IPPure 功能对照 | 能力与限制逐项说明 |

验收记录和 404 页面设为 noindex；站点地图只包含四个主要页面。参考指数不是 Claude 识别概率，不使用虚假评分或保证性文案。

## 技术配置

- `scripts/seo.mjs` 集中维护标题、描述、canonical、Open Graph、Twitter 和 JSON-LD。
- 构建生成 robots.txt、sitemap.xml 和 404.html；内部首页链接统一到根路径。
- WebSite、WebPage、WebApplication 与 BreadcrumbList 描述实际页面内容；没有伪造评级、评论或 FAQ 富结果承诺。
- 首页说明与常见问题是静态 HTML；教程无需 JavaScript 也可阅读。检测依然需要点击启动。
- `npm run check` 运行单元测试、构建和生成文件检查。GitHub Actions 发布前也执行生成文件检查。
- 修改部署地址时设置 SITE_URL；Google 验证文件属于当前站点，复制项目时不要将其作为自己的验证文件。

## Google Search Console

使用 URL 前缀资源 `https://claude-network-check.github.io/`，HTML 文件验证。保留 `site/googlec557c1b9f9d8a641.html`，否则后续复验可能失败；这是公开验证文件，不是账号密码或 API 密钥。

站点地图地址为 `https://claude-network-check.github.io/sitemap.xml`。提交成功只表示 Google 接受请求，不表示已经收录。后续在 Search Console 查看网页索引、搜索词、展示次数和点击率，再据实际需求改进内容；不自动反复请求收录。

## 2026-10-17 提交记录

- Google Search Console 的 HTML 文件所有权验证已通过。
- sitemap.xml 已提交，包含四个主要页面；首次读取暂显示“无法读取此站点地图”。线上文件返回 HTTP 200、application/xml，XML 可正常解析，robots.txt 允许抓取且声明了正确地址。Google 的后续读取状态仍需观察。
- 首页已通过请求索引流程，Google 确认“已将网址添加到优先抓取队列中”；这不代表已收录或获得排名。
- 39 项单元测试及构建后的 SEO 检查通过。正式站点的静态 FAQ、结构化数据、移动布局、教程导航和真实 404 响应已核对。
