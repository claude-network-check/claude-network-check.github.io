# 检测方法与免费数据源

更新日期：2026-10-24。整站是 GitHub Pages 上的纯静态页面，所有检测都在浏览器内完成，借助免费、无密钥、允许跨域的外部服务取得网页本身拿不到的数据。**不需要自建后端，不等于不依赖外部服务。**

## 每一项怎么测

| 检测 | 方法 | 数据源 | 判定 |
| --- | --- | --- | --- |
| Claude 出口 IP | 请求 `claude.ai` 和 `claude.com` 的 `/cdn-cgi/trace`，读 `ip`、`loc`、`colo`，记录往返耗时 | Claude 前端的 Cloudflare | 两个域名分别显示 |
| 支持地区 | 优先用 trace 里 Cloudflare 自己给出的 `loc` 国家代码；拿不到时才用 IP 库 | [Anthropic 支持地区政策](https://www.anthropic.com/supported-countries) | 不在名单内（含 CN、HK、MO、RU 等）为高风险 |
| IP 归属 | 国家、城市、ASN、运营商、所在时区 | [ipinfo.io](https://ipinfo.io/)，备用 [ipwho.is](https://ipwhois.io/)、[country.is](https://country.is/) | 每轮最多 10 个地址，响应 IP 必须与查询一致 |
| IP 类型 | 机房 / 住宅 / 移动，VPN、代理、Tor 标记 | [ipquery.io](https://ipquery.io/) | 有匿名标记为“注意”，机房 IP 只作提示 |
| 普通网页出口 | IPv4 / IPv6 分别回显 | [icanhazip](https://icanhazip.com/)，备用 [ipify](https://www.ipify.org/)、[ident.me](https://api.ident.me/) | 与 Claude 出口不一致为“注意” |
| DNS 泄露 | 16 次随机子域名查询，由权威 DNS 记下是哪个递归解析器来查 | Surfshark ×5、Fastly ×5、BrowserLeaks IPv4 ×3、IPv6 ×3 | 出现中国大陆解析器即泄露 |
| WebRTC 泄露 | 一次 ICE 收集，同时连接 5 个 STUN 服务器，解析公网候选及其归属 | B 站、小米、芒果 TV、Cloudflare、Google STUN | 公网候选在中国大陆为泄露；不同于所有出口为“注意” |
| 中文环境特征 | 六项浏览器信号加权，0–100 分 | 浏览器本地 API | 0–30 低、31–60 中、61–100 高 |
| 时区一致性 | 浏览器 IANA 时区与出口 IP 所在时区对照 | 本地 + IP 归属 | 当前偏移不同为“注意” |

## 为什么用国内 STUN 服务器

很多分流规则把国内域名设为 DIRECT。如果只连 Cloudflare 或 Google 的 STUN，UDP 会和其他境外流量一起走代理，看起来“没有泄露”；但浏览器访问国内网站的 WebRTC 流量仍可能直连，暴露真实宽带地址。同时连接 B 站、小米、芒果 TV 的 STUN 才能发现这种情况。这也是此前版本与 IPPure 结果不一致的主要原因之一。

## 为什么 DNS 要查 16 次

一次查询只能看到一个递归解析器。系统可能配置了多个上游，代理客户端也可能在 fake-ip 与真实解析之间切换。四个服务、16 次随机子域名能把整组解析器尽量采全，任何一个落在中国大陆就说明有 DNS 请求没走代理。旧版只查 3 次 Upset EDNS，样本太少，也会把正常的 ECS 子网误报为问题，已移除。

## 中文环境评分

六项信号、权重和部分得分规则与 [IPPure Claude 页](https://ippure.com/claude)一致，同一个浏览器两边分数相同：

| 信号 | 权重 | 得分规则 |
| --- | --- | --- |
| 系统时区 | 30 | Asia/Shanghai、Asia/Urumqi 等 1；Asia/Hong_Kong、Asia/Macau、Asia/Taipei 0.6 |
| 浏览器语言 | 24 | 首选简体中文 1；首选繁体 0.5；列表含简体 0.7；含其他中文 0.4 |
| 中文字体 | 20 | 探测到简体字体 0.75 + 0.08 × 数量（封顶 1）；只有繁体字体 0.5 |
| Intl 区域设置 | 10 | 简体中文 1；其他中文 0.5 |
| UTC 偏移 | 8 | UTC+8 为 0.7 |
| Emoji / 系统风格 | 8 | 由 UA 推断：Apple 0.25、Google 0.35、Microsoft 0.4、Linux 0.5 |

单项得分 ≥ 0.25 计为命中。只有系统时区与公开逆向分析中 Claude Code 读取的字段一一对应；其余五项是相关特征。macOS 和 Windows 都自带中文字体，所以“中文字体”几乎总会命中，页面会标注“均为系统自带”。**分数是估计，不是 Claude 的判定，低分不代表账号安全。**

## 结论怎么得出

- **高风险**：出口在不支持地区；DNS 出现中国大陆解析器；WebRTC 暴露中国大陆 IP；系统时区为中国时区；中文环境评分高；IPv6 出口在不支持地区。
- **注意**：claude.ai、claude.com 与普通网页出口不一致；WebRTC 公网地址不同于出口；浏览器时区与出口 IP 时区不一致；出口 IP 有 VPN / 代理 / Tor 标记；中文环境评分中等。
- **提示**：出口是机房 IP；浏览器处于自动化控制。

请求失败、被限流或被扩展拦截时显示“未知”，不会当作通过。

## 候选服务与取舍

| 服务 | 结果 | 取舍 |
| --- | --- | --- |
| [Upset EDNS](https://upset.dev/edns) | 免费、CORS 可用 | 单次只返回一个解析器；改用四个服务 16 次采样 |
| [ipapi.is 匿名接口](https://ipapi.is/developers.html) | 匿名响应已不含机房 / VPN 字段 | 不再使用 |
| [proxycheck.io](https://proxycheck.io/) | 有 IP 类型和代理判断 | 响应没有跨域许可，浏览器读不到 |
| [ipapi.co](https://ipapi.co/free/) | 匿名请求经常 429 | 不作为默认 |
| [IPinfo Lite](https://ipinfo.io/pricing) | 带 token 的版本更稳定 | 不在前端公开 token，使用匿名额度 |

以上额度和条款会变化。页面不轮询、不重试已限流的服务，也不使用公共 CORS 代理（那会测到代理服务器自己的出口）。

## 纯前端做不到什么

- 读不到 Clash 规则、系统路由、终端环境变量或其他应用的代理链。
- 读不到 Claude 的内部风控、账号状态或封禁概率。
- 跨域失败与网络阻断无法可靠区分；一次成功不代表长期稳定。
- 浏览器结果不能代表 Claude Code，终端需要单独检查。

## 复现

`npm run dev` 后打开 http://127.0.0.1:4173 ，页面会自动开始检测。在开发者工具的网络面板可以看到上表中的每个请求；所有请求都关闭凭据、省略 Referer。实测记录见[测试记录](validation.md)。
