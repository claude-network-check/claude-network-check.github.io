// Presentation-only wrapper; the five steps remain authored in the Markdown guide.
const steps = [['routing', '串联节点', '连接中转与固定出口'], ['tun', 'TUN 与规则', '为应用明确连接去向'], ['dns', 'DNS 路径', '让解析跟随预期出口'], ['browser', '浏览器环境', '核对时区、语言与 WebRTC'], ['verify', '检测与验证', '逐项确认配置已生效']];
const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const paths = {device: 'M3 4h18v13H3zM8 21h8M12 17v4', rules: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6', relay: 'M3 7h13l-3-3m3 3-3 3M21 17H8l3-3m-3 3 3 3', exit: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c4 5 4 13 0 18-4-5-4-13 0-18', site: 'M4 3h16v18H4zM4 8h16M8 5.5h1M8 12h8M8 16h5'};
const nodes = [['device', '你的设备', '浏览器 · CLI', null], ['rules', 'Clash', 'TUN + 规则', 'tun'], ['relay', '中转节点', '可选', 'routing'], ['exit', '固定出口', 'ISP / 住宅', 'routing'], ['site', 'Claude', '看到固定出口', 'verify']];

function flow() {
  const lane = nodes.map(([id, title, sub, anchor], i) => {
    const tag = anchor ? 'a' : 'div';
    return `${i ? '<span class="route-arrow" aria-hidden="true"></span>' : ''}<${tag} class="route-node${id === 'exit' ? ' is-accent' : ''}${id === 'relay' ? ' is-optional' : ''}"${anchor ? ` href="#${anchor}"` : ''}>${icon(paths[id])}<strong>${title}</strong><small>${sub}</small></${tag}>`;
  }).join('');
  return `<figure class="route" aria-labelledby="route-caption"><div class="route-lane">${lane}</div><figcaption id="route-caption"><span class="route-tag">DIRECT</span>明确列出的直连域名按系统路由访问，其余流量按规则交给固定出口。</figcaption></figure>`;
}
function verify() {
  return `<div class="verify-grid">${[['01', '先看出口', 'Claude 出口在支持地区，且与普通网页一致。'], ['02', '再查泄露', 'DNS 没有国内解析器，WebRTC 没有暴露真实 IP。'], ['03', '分别验证应用', '浏览器、终端和桌面应用不能相互代替验证。']].map(([n, t, p]) => `<div><span>${n}</span><strong>${t}</strong><p>${p}</p></div>`).join('')}</div>`;
}

export function guidePage(source, markdown) {
  const chunks = source.split(/^## /m);
  chunks.shift();
  if (chunks.length !== steps.length) throw new Error('The guide must have five named steps');
  const body = chunks.map((chunk, i) => {
    const [id, , sub] = steps[i];
    const firstLine = chunk.indexOf('\n');
    const title = chunk.slice(0, firstLine).replace(/^\d+\. /, '');
    const content = markdown(chunk.slice(firstLine + 1)).replace(/<p><img[^>]*02-checklist\.png[^>]*><\/p>/, verify());
    return `<section class="guide-step" id="${id}" aria-labelledby="${id}-title"><header class="step-head"><span class="step-number">${String(i + 1).padStart(2, '0')}</span><div><p>${sub}</p><h2 id="${id}-title">${title}</h2></div></header><div class="step-body">${content}</div></section>`;
  }).join('');
  const prep = [['固定出口代理', '协议、地址、端口和凭据。'], ['Clash 客户端', '支持 Mihomo 与 TUN。'], ['中转节点', '可选，按线路质量决定。']];
  return `<main class="guide" id="main"><section class="wrap guide-hero"><div><p class="eyebrow">配置教程 · 5 步</p><h1>Claude 网络配置，<br>五步固定出口</h1><p class="guide-lede">从固定出口到浏览器环境，搭好并验证你的 Claude 网络。每一步都附验证要点。</p><div class="guide-actions"><a class="btn btn-primary" href="#routing">开始配置</a><a class="btn" href="./skills/claude-network-setup/assets/mihomo.template.yaml" download>下载 Mihomo 模板</a></div></div><aside class="prep"><p class="eyebrow">开始前准备</p>${prep.map(([t, d], i) => `<div class="prep-item"><span>${i + 1}</span><div><strong>${t}</strong><p>${d}</p></div></div>`).join('')}<p class="prep-note">“静态 ISP”不等于真实家庭宽带；地区与供应商按需求选择。</p></aside></section><div class="wrap">${flow()}</div><div class="wrap guide-layout"><aside class="guide-side"><nav class="guide-nav" aria-label="配置步骤"><p class="eyebrow">步骤</p><ol>${steps.map(([id, label], i) => `<li><a href="#${id}"><span>${String(i + 1).padStart(2, '0')}</span>${label}</a></li>`).join('')}</ol></nav><div class="side-card"><strong>让 Agent 协助配置</strong><p>Skill 会检查配置来源，先备份，再修改与验证。</p><a href="./downloads/claude-network-setup.zip">下载 Skill →</a></div></aside><article class="guide-article">${body}<section class="guide-finish"><h2>配置完成，现在验证一下</h2><p>在实际使用的浏览器 Profile 中打开检测页，确认出口、DNS、WebRTC 与中文环境评分。</p><div class="guide-actions"><a class="btn btn-primary" href="./">打开环境检测</a><a class="btn" href="./downloads/claude-network-setup.zip">下载诊断 Skill</a></div></section></article></div></main>`;
}
