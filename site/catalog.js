// Each entry corresponds to a distinct observation, not a promise of account safety.
export const checks = [
  {id:'ipv4',group:'network',name:'公网 IPv4',hint:'HTTP 请求的 IPv4 出口',icon:'4',source:'ipify / ident.me'},
  {id:'ipv6',group:'network',name:'公网 IPv6',hint:'检查另一协议族的出口',icon:'6',source:'ipify / ident.me IPv6-only'},
  {id:'geo',group:'network',name:'IP 地区与运营商',hint:'国家、城市、ASN 与 ISP',icon:'◎',source:'country.is + ipapi.is / ipwho.is'},
  {id:'claude-ai',group:'network',name:'claude.ai 出口',hint:'Claude 应用域名的实际出口',icon:'C',source:'claude.ai trace'},
  {id:'claude-com',group:'network',name:'claude.com 出口',hint:'Claude 官网域名的实际出口',icon:'C',source:'claude.com trace'},
  {id:'egress',group:'network',name:'多域名出口一致性',hint:'按 IPv4 / IPv6 分别交叉比较',icon:'⇄',source:'HTTP 出口交叉比较',extra:true},
  {id:'dns',group:'network',name:'DNS 解析器',hint:'3 次独立查询 · 去重与地区归属',icon:'D',source:'Upset EDNS + country.is + ipapi.is / ipwho.is'},
  {id:'ecs',group:'network',name:'ECS 子网暴露',hint:'DNS 是否携带客户端子网信息',icon:'⌗',source:'Upset EDNS',extra:true},
  {id:'rtc',group:'network',name:'WebRTC 地址暴露',hint:'公网、本地、mDNS 候选与地区',icon:'↗',source:'Cloudflare STUN + country.is + ipapi.is / ipwho.is'},
  {id:'stability',group:'network',name:'HTTP 响应稳定性',hint:'3 次响应耗时与出口变化',icon:'≈',source:'ipify · HTTP 总耗时',extra:true},
  {id:'timezone',group:'browser',name:'系统时区',hint:'浏览器可见的 IANA 时区',icon:'◷',source:'Intl.DateTimeFormat'},
  {id:'languages',group:'browser',name:'浏览器语言',hint:'首选语言与完整语言列表',icon:'文',source:'navigator.languages'},
  {id:'fonts',group:'browser',name:'中文字体',hint:'24 种字体 · 三组回退字体比对',icon:'字',source:'Canvas 字宽推断'},
  {id:'locale',group:'browser',name:'Intl 区域设置',hint:'日期、数字格式与日历系统',icon:'日',source:'Intl.DateTimeFormat / NumberFormat'},
  {id:'offset',group:'browser',name:'UTC 偏移',hint:'当前偏移与季节变化',icon:'±',source:'Date.getTimezoneOffset'},
  {id:'emoji',group:'browser',name:'Emoji 渲染',hint:'实际像素颜色 + 平台风格线索',icon:'☺',source:'Canvas 像素 + UA 推断'},
  {id:'language-match',group:'browser',name:'语言一致性',hint:'首选语言与 Intl 主语言对照',icon:'≋',source:'本地交叉比较',extra:true},
  {id:'timezone-match',group:'browser',name:'时区一致性',hint:'Intl 声明时区与 Date 偏移对照',icon:'◴',source:'本地交叉比较',extra:true},
  {id:'platform',group:'browser',name:'浏览器与系统',hint:'UA、Client Hints、平台及自动化标记',icon:'⌘',source:'Navigator / UA Client Hints',extra:true},
  {id:'graphics',group:'browser',name:'图形渲染器',hint:'WebGL 可见的厂商与渲染器',icon:'◇',source:'WebGL',extra:true},
  {id:'display',group:'browser',name:'屏幕与输入设备',hint:'分辨率、像素密度、色深与触控',icon:'▣',source:'Screen / matchMedia',extra:true},
  {id:'privacy',group:'browser',name:'浏览器隐私信号',hint:'安全上下文、DNT、GPC 与 Cookie 设置',icon:'◈',source:'浏览器公开 API',extra:true}
];
export const networkIDs=checks.filter(c=>c.group==='network').map(c=>c.id);
