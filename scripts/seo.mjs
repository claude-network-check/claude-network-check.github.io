const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export const pageMetadata={
  'index.html':{path:'',title:'Claude 环境检测：出口 IP、DNS 与 WebRTC 泄露、中国用户特征 · Network Check',description:'免费开源的 Claude 访问环境检测。查看 Claude 出口 IP 与支持地区、16 次 DNS 泄露采样、WebRTC 泄露、IP 类型，以及与 IPPure 同算法的中文环境评分。'},
  'guide.html':{path:'guide.html',label:'配置教程',title:'Claude 网络配置教程：Mihomo、TUN 与 DNS · Network Check',description:'用五步图文教程配置代理中转、固定出口、Mihomo TUN 与规则，核对 DNS、WebRTC、浏览器和 Claude Code 的实际网络路径。'},
  'research.html':{path:'research.html',label:'检测方法',title:'网络检测原理与免费 API：IP、DNS、WebRTC · Network Check',description:'了解纯前端网络检测的实现方法、免费 API、数据来源、隐私边界与限制。区分可观测结果、检测受限和无法确认的项目。'},
  'coverage.html':{path:'coverage.html',label:'检测范围',title:'检测范围与 IPPure、net.coffee 对照 · Network Check',description:'逐项说明 Claude Network Check 的网络与浏览器检查能力、与 IPPure、net.coffee Claude 检测页的逐项对照，以及各项检测的证据和限制。'},
  'validation.html':{path:'validation.html',label:'验收记录',title:'测试与验收记录 · Network Check',description:'Claude Network Check 的自动化测试、真实浏览器验证、响应式布局及隐私验收记录。',noindex:true}
};
export function siteBase(input='https://claude-network-check.github.io/'){
  const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('SITE_URL must be a public HTTPS base URL without credentials, query or fragment');
  if(!url.pathname.endsWith('/'))url.pathname+='/';return url.href;
}
export function seoHead(meta,base){
  const url=new URL(meta.path,base).href,image=new URL('social-preview.png',base).href;
  const website={'@type':'WebSite','@id':`${base}#website`,name:'Claude Network Check',alternateName:'Claude 环境检测',url:base,inLanguage:'zh-CN'};
  const page={'@type':'WebPage','@id':`${url}#webpage`,name:meta.title,url,description:meta.description,inLanguage:'zh-CN',isPartOf:{'@id':website['@id']}};
  const graph=[website,page];
  if(!meta.path){
    page.mainEntity={'@id':`${base}#application`};
    graph.push({'@type':'WebApplication','@id':`${base}#application`,name:'Claude Network Check',url,description:meta.description,inLanguage:'zh-CN',applicationCategory:'UtilitiesApplication',operatingSystem:'Web browser',isAccessibleForFree:true,browserRequirements:'Requires JavaScript for diagnostics',featureList:['Claude 出口 IP 与支持地区','DNS 泄露检测','WebRTC 泄露检测','IP 类型与匿名标记','中文环境特征评分'],sameAs:'https://github.com/claude-network-check/claude-network-check.github.io'});
  }else{
    page.breadcrumb={'@id':`${url}#breadcrumb`};
    graph.push({'@type':'BreadcrumbList','@id':`${url}#breadcrumb`,itemListElement:[{'@type':'ListItem',position:1,name:'Claude 环境检测',item:base},{'@type':'ListItem',position:2,name:meta.label||meta.title,item:url}]});
  }
  const structured={'@context':'https://schema.org','@graph':graph};
  return `<title>${escape(meta.title)}</title><meta name="description" content="${escape(meta.description)}"><link rel="canonical" href="${escape(url)}"><meta name="robots" content="${meta.noindex?'noindex,follow':'index,follow,max-image-preview:large'}"><meta name="theme-color" content="#2450c2"><meta property="og:type" content="website"><meta property="og:locale" content="zh_CN"><meta property="og:site_name" content="Claude Network Check"><meta property="og:title" content="${escape(meta.title)}"><meta property="og:description" content="${escape(meta.description)}"><meta property="og:url" content="${escape(url)}"><meta property="og:image" content="${escape(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Claude Network Check：网络出口、DNS、WebRTC 与浏览器地区检查"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(meta.title)}"><meta name="twitter:description" content="${escape(meta.description)}"><meta name="twitter:image" content="${escape(image)}"><meta name="twitter:image:alt" content="Claude Network Check：出口、DNS、WebRTC 与中文环境检测"><script type="application/ld+json">${JSON.stringify(structured).replaceAll('<','\\u003c')}</script>`;
}
export function sitemap(base){return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.values(pageMetadata).filter(p=>!p.noindex).map(p=>`<url><loc>${escape(new URL(p.path,base).href)}</loc></url>`).join('')}</urlset>\n`;}

export function documentNavigation(meta){
  const breadcrumb=`<nav class="breadcrumb" aria-label="面包屑"><a href="./">Claude 环境检测</a><span aria-hidden="true">/</span><span aria-current="page">${escape(meta.label)}</span></nav>`;
  const related=`<aside class="related-pages" aria-labelledby="related-title"><h2 id="related-title">继续了解</h2><ul><li><a href="./">检测当前网络环境</a></li>${Object.values(pageMetadata).filter(p=>p.path&&!p.noindex&&p.path!==meta.path).map(p=>`<li><a href="./${p.path}">${escape(p.label)}</a></li>`).join('')}<li><a href="https://github.com/claude-network-check/claude-network-check.github.io">开源代码与问题反馈 ↗</a></li></ul></aside>`;
  return {breadcrumb,related};
}
export function notFoundPage(base){
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>页面未找到 · Claude Network Check</title><link rel="stylesheet" href="${escape(base)}base.css"><link rel="icon" href="${escape(base)}favicon.svg"></head><body><main class="wrap document not-found"><p class="eyebrow">404 / PAGE NOT FOUND</p><h1>这个页面不存在。</h1><p>链接可能已变更。你可以回到检测页，或继续阅读配置教程。</p><p><a href="${escape(base)}">Claude 环境检测 →</a></p><p><a href="${escape(base)}guide.html">五步配置教程 →</a></p></main></body></html>`;
}
