# 免费检测方案调研

调研日期：2026-10-17。结论：GitHub Pages 可以承载完整前端，免费外部服务负责 IP 回显、归属和 DNS 权威观测。**不需要自建后端，不等于不依赖后端。** 无法免费、可靠地复刻 Claude 内部风控或认证住宅 IP 质量。

## 本项目采用

| 检测 | 实现与官方资料 | 免费边界 | 本项目处理 |
| --- | --- | --- | --- |
| IPv4 / IPv6 | [ipify](https://www.ipify.org/) + [ident.me](https://api.ident.me/) | 免费、无密钥；ident.me 支持 4./6. 协议限定入口 | ipify 失败后使用 ident.me；严格校验协议族 |
| 国家归属 | [country.is](https://country.is/) | 官方称无配额，每 IP 每秒 10 请求基础设施限流；允许商用；浏览器 CORS 已实测 | 独立取得国家，避免 ASN 接口失效连带丢失地区 |
| 城市 / ASN / ISP | [ipapi.is 匿名接口](https://ipapi.is/developers.html)，备用 [ipwho.is](https://ipwhois.io/documentation) | ipapi.is 无密钥基础查询 30 次/IP/UTC 日，无安全情报；ipwho.is 共享免费额度可能限流 | 匿名元数据失败再切备用，结果只在内存缓存 5 分钟；每轮最多 8 个去重地址，每地址最多 3 个服务 |
| DNS / ECS | [Upset EDNS](https://upset.dev/edns) | 免费、无密钥、明确支持 CORS；可能限流，未公布具体额度或 SLA | 跟随随机主机名重定向，解析 dns.ip 和可选 edns.ip |
| WebRTC | [Cloudflare STUN](https://developers.cloudflare.com/realtime/turn/faq/) + [ICE API](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icecandidate_event) | STUN 官方免费不限量；TURN 是另一项服务 | 数据通道触发 ICE；7 秒上限，结束关闭连接，不请求摄像头 |
| 目标域名出口 | claude.ai / claude.com 的 /cdn-cgi/trace | 诊断端点，不是承诺长期开放的开发者 API | 尽力读取 ip；失败保留未知，不据此判账号状态 |
| 语言、时区 | [navigator.languages](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages)、[Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/resolvedOptions) | 纯前端，无调用额度 | 仅在点击后读取，不上传 |
| 字体、平台线索 | Canvas 测量宽度 + 浏览器平台字段 | 纯前端；只能推断，受隐私保护、字体回退影响 | 供查看，不计分；不把平台推断称为 Emoji 像素检测 |

DNS 单次只看到此次请求的递归解析器，不是整台电脑 DNS 清单。Anycast 归属可能与实际服务器位置不同。ECS 可能关联代理、解析器或客户端子网，不能直接断言是真实家庭 IP。公网 ICE 与 HTTP 不同，可能源自 IPv6、多出口或分流；没有候选也不能证明安全。

## 其他候选与取舍

| 服务 / 方法 | 调研结果 | 为什么未作默认 |
| --- | --- | --- |
| [dnsleak.dev](https://dnsleak.dev/api) | 正式免费 API，无密钥，允许第三方使用；[接口说明](https://dnsleak.dev/llms.txt) 完整 | 本次 /api/new 响应未提供跨域许可；不能仅凭服务器请求成功认定 Pages 可用 |
| ipapi.is 完整安全情报 | 密钥方案提供更多字段；匿名响应仅有基础归属 | 已采用匿名基础查询；完整信誉及住宅判定仍未接入，不公开密钥 |
| [ipapi.co](https://ipapi.co/free/) | 当前免费入口为限时试用 | 不能当作长期免费 API |
| [IPinfo Lite](https://ipinfo.io/pricing) | 免费 Lite 的基础国家和 ASN 产品 | 需账户 token；默认方案避免公开账户凭据 |
| [IPPure MyIP API](https://ippure.com/MyIP-Info-API.html) | 有公开文档，无密钥示例 | 未确认稳定跨域、额度及长期使用边界，本次访问失败；不复用网页内部接口 |
| [whatsmyip.fyi](https://whatsmyip.fyi/api) | 部分 CORS 接口已提供 | DNS leak 端点文档标为计划中，并非已交付 |
| [bash.ws](https://bash.ws/dnsleak) / [CLI](https://github.com/macvk/dnsleaktest) | 有开源检测客户端 | 客户端开源许可证不等于服务调用授权；CORS/服务条款尚未验证 |
| [addr.tools](https://github.com/brianshea2/addr.tools) | 开源 DNS 检测参考 | 需要权威 DNS 等服务端基础设施，Pages 单独不够 |
| [MyIP](https://github.com/jason5ng32/MyIP) | 开源 IP 工具箱 | 全部能力涉及服务端或外部服务；可作扩展参考 |
| [DNSLeakTester](https://github.com/ygbull/DNSLeakTester) | 前端配合 Workers/KV 与外部检测服务 | 免费层不等于纯 Pages，无需为当前基础版增加部署环节 |
| [ip-leak-check](https://github.com/ObsisMc/ip-leak-check) | 静态诊断参考，另有可选函数处理跨域 | 只作方案参考，未复制代码 |

以上额度和条款会变化。公开推广前应重新检查供应商文档。免费接口没有整体可用性保证，不设置自动轮询，不反复重试已限流服务；仅切换公开的备用接口。也不使用公共 CORS 代理，避免检测到代理服务器的出口。

## IPPure 的分数与本项目的区别

本次查看 [IPPure Claude 页面](https://ippure.com/claude) 的公开前端资源，观察到六类本地信号：时区 30、语言 24、字体推断 20、Intl 地区 10、UTC 偏移 8、平台相关“Emoji”线索 8。DNS、WebRTC、出口 IP 没有参与这组前端分数。页面自己的说明也不将它等同于 Claude 官方判断。网站可能更新，不能把某次实现视为永久公式；更没有证据证明 Claude 使用完全相同的信号与权重。

本项目独立实现，不复制其源码或 UI。参考值只有四项：大陆时区标识 40、首选中文 30、Intl 中文地区 20、UTC+8 偏移 10。采用可审计的简单加分，而不是推断用户真实所在地。字体和平台仍展示，但因为误判多而不计分。**分数不能与 IPPure 直接比较，30 不是通过线；低分不代表账号安全。**

中文是合法偏好，多个国家使用 UTC+8；改变语言和时区并不会修复 IP 信誉或网络路由。这个工具更适合检查配置是否按预期生效，而不是追求低分。

## 纯前端做不到什么

- 无外部服务时，浏览器不能凭空知道 NAT 后的公网 IP，也不能读取操作系统实际使用的递归 DNS 清单。
- DNS 泄露测试需要独特域名和权威 DNS 观测。查询公共 DoH API 只是在测试那一个 DoH 服务，不等于检测系统 DNS。
- 无法从网页读取 Clash 规则、整个系统路由、终端环境变量或所有应用代理链。
- 不能获得 Claude 内部风控、账号状态、真实封禁概率或准确住宅信誉分数。
- 不能把 CORS 失败与网络阻断可靠地区分，不能用一次成功代表长期稳定。

## 实测记录与复现

当前版本的接口与浏览器验收结果见 [测试记录](validation.md)。实测只保留服务状态和结果类型，未把实际出口、解析器或原始响应写进仓库。

复现时启动本地页面，点击网络检测；开发者工具中检查请求的 CORS、超时及状态。完整模式每次最多三组 IPv4、一次 IPv6 探测（每组最多主备各一次请求）、八个去重 IP 归属（每地址最多三个服务）、两次 trace、三次 DNS（含服务重定向）和一次 STUN 会话。只检查本地环境时应没有跨站请求。所有服务请求关闭凭据并尽可能省略 Referer。

## GitHub Pages 部署边界

[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) 只托管静态资源。仓库内准备了手动触发的 Actions 工作流，实际发布由仓库拥有者决定。没有创建远端或执行部署。HTTPS 与 localhost 可用于浏览器检测；不要直接双击 file:// 文件运行。

新增 Emoji 实际像素观测、三个 DNS 样本和更多环境检查，详见[功能对照](coverage.zh-CN.md)。它们不改变四项参考指数。
