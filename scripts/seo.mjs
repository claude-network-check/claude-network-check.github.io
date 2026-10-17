const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export const pageMetadata={
  'index.html':{path:'',title:'Claude 环境检测：IP、DNS 与 WebRTC 诊断 · Network Check',description:'免费开源的 Claude 网络环境检测工具。22 项检查覆盖访问出口、DNS、WebRTC、IPv6、时区与浏览器语言，附 Mihomo 配置教程和 Agent Skill。'},
  'guide.html':{path:'guide.html',title:'Claude 网络配置教程：Mihomo、TUN 与 DNS · Network Check',description:'用五步图文教程配置代理中转、固定出口、Mihomo TUN 与规则，核对 DNS、WebRTC、浏览器和 Claude Code 的实际网络路径。'},
  'research.html':{path:'research.html',title:'网络检测原理与免费 API：IP、DNS、WebRTC · Network Check',description:'了解纯前端网络检测的实现方法、免费 API、数据来源、隐私边界与限制。区分可观测结果、检测受限和无法确认的项目。'},
  'coverage.html':{path:'coverage.html',title:'22 项网络检测范围与 IPPure 功能对照 · Network Check',description:'逐项说明 Claude Network Check 的网络与浏览器检查能力、与 IPPure Claude 页的功能对照，以及各项检测的证据和限制。'},
  'validation.html':{path:'validation.html',title:'测试与验收记录 · Network Check',description:'Claude Network Check 的自动化测试、真实浏览器验证、响应式布局及隐私验收记录。',noindex:true}
};
export function siteBase(input='https://claude-network-check.github.io/'){
  const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('SITE_URL must be a public HTTPS base URL without credentials, query or fragment');
  if(!url.pathname.endsWith('/'))url.pathname+='/';return url.href;
}
export function seoHead(meta,base){
  const url=new URL(meta.path,base).href,image=new URL('social-preview.png',base).href;
  const structured={'@context':'https://schema.org','@type':meta.path?'WebPage':'WebApplication',name:meta.title,url,description:meta.description,inLanguage:'zh-CN',...(meta.path?{isPartOf:{'@type':'WebSite',name:'Claude Network Check',url:base}}:{applicationCategory:'UtilitiesApplication',operatingSystem:'Web browser',isAccessibleForFree:true,browserRequirements:'Requires JavaScript for diagnostics',codeRepository:'https://github.com/claude-network-check/claude-network-check.github.io'})};
  return `<title>${escape(meta.title)}</title><meta name="description" content="${escape(meta.description)}"><link rel="canonical" href="${escape(url)}"><meta name="robots" content="${meta.noindex?'noindex,follow':'index,follow,max-image-preview:large'}"><meta name="theme-color" content="#25473e"><meta property="og:type" content="website"><meta property="og:locale" content="zh_CN"><meta property="og:site_name" content="Claude Network Check"><meta property="og:title" content="${escape(meta.title)}"><meta property="og:description" content="${escape(meta.description)}"><meta property="og:url" content="${escape(url)}"><meta property="og:image" content="${escape(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Claude Network Check：网络出口、DNS、WebRTC 与浏览器地区检查"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(meta.title)}"><meta name="twitter:description" content="${escape(meta.description)}"><meta name="twitter:image" content="${escape(image)}"><script type="application/ld+json">${JSON.stringify(structured).replaceAll('<','\\u003c')}</script>`;
}
export function sitemap(base){return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.values(pageMetadata).filter(p=>!p.noindex).map(p=>`<url><loc>${escape(new URL(p.path,base).href)}</loc></url>`).join('')}</urlset>\n`;}
