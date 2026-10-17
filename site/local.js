export const fontNames=['Microsoft YaHei','Microsoft JhengHei','SimSun','NSimSun','SimHei','FangSong','KaiTi','DengXian','PingFang SC','PingFang TC','Hiragino Sans GB','Heiti SC','Heiti TC','Songti SC','STHeiti','STSong','STKaiti','STFangsong','Noto Sans CJK SC','Noto Serif CJK SC','Source Han Sans SC','Source Han Serif SC','HarmonyOS Sans SC','Alibaba PuHuiTi'];
const result=(state,value,summary,rows=[])=>({state,value,summary,rows});
export function baseLanguage(value){return typeof value==='string'?value.toLowerCase().split(/[-_]/)[0]:null;}
export function offsetLabel(minutes){if(!Number.isFinite(minutes))return '未提供';const n=Math.abs(minutes);return `UTC${minutes>=0?'+':'−'}${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
export function offsetAtZone(timezone, date=new Date()){
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const parts=Object.fromEntries(formatter.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  return Math.round((Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second)-Math.floor(date.getTime()/1000)*1000)/60000);
}
export function consistency(a,b,description){
  if(a==null||b==null||a===''||b==='')return result('unknown','信息不足','缺少对照字段，无法判断一致性。');
  return result(a===b?'observed':'review',a===b?'一致':'存在差异',description,[['第一项',String(a)],['第二项',String(b)]]);
}
export function platformStyle(ua){
  if(/Android/i.test(ua))return 'Android / Google 风格线索';
  if(/Macintosh|iPhone|iPad/i.test(ua))return 'Apple 风格线索';
  if(/Windows/i.test(ua))return 'Microsoft 风格线索';
  if(/Linux/i.test(ua))return 'Linux 风格线索';
  return '无法从 UA 推断';
}
export function pixelStats(bytes){
  let ink=0,color=0;
  for(let i=0;i<bytes.length;i+=4){if(bytes[i+3]<32)continue;ink++;if(Math.max(bytes[i],bytes[i+1],bytes[i+2])-Math.min(bytes[i],bytes[i+1],bytes[i+2])>24)color++;}
  return {ink,color,ratio:ink?color/ink:null};
}
function fontProbe(doc){
  const ctx=doc.createElement('canvas').getContext('2d');if(!ctx)throw new Error('Canvas 不可用');
  const strings=['汉字字体測試 ABC 123','网络环境：简体繁體 Wm@'];
  const bases=['monospace','serif','sans-serif'];
  const detected=fontNames.filter(font=>strings.some(sample=>bases.filter(base=>{ctx.font=`64px ${base}`;const before=ctx.measureText(sample).width;ctx.font=`64px "${font}",${base}`;return Math.abs(before-ctx.measureText(sample).width)>.1;}).length>=2));
  return result('observed',`${detected.length} / ${fontNames.length} 种有匹配线索`,'通过字宽差异推断，字体别名、回退及浏览器隐私保护会影响结果；不等于准确枚举已安装字体，不计分。', [['有匹配线索的字体',detected.join('、')||'未推断到'],['探测字体数',fontNames.length],['方法','两段文字 × 三组回退字体']]);
}
function emojiProbe(doc,ua){
  const canvas=doc.createElement('canvas');canvas.width=96;canvas.height=96;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas 不可用');
  const samples=['😀','🌍','🇨🇳','🇺🇳'];
  let readable=0;
  const rows=samples.map(glyph=>{ctx.clearRect(0,0,96,96);ctx.fillStyle='#000';ctx.font='56px sans-serif';ctx.textBaseline='top';ctx.fillText(glyph,8,8);const s=pixelStats(ctx.getImageData(0,0,96,96).data);if(s.ratio!==null)readable++;return [glyph,s.ratio===null?'无可读像素':s.ratio>.02?`彩色像素 ${Math.round(s.ratio*100)}%`:'单色或文字回退'];});
  return result(readable===samples.length?'observed':'unknown',readable?platformStyle(ua):'像素不可读取','测量四个 Emoji 的彩色像素占比；平台风格另由 UA 推断。单色不能证明地区限制，结果不计分，也不生成指纹哈希。',rows);
}
export function collectLocal(win=window){
  const nav=win.navigator,doc=win.document,checks={};let env={};
  const safe=(id,fn)=>{try{checks[id]=fn();}catch{checks[id]=result('unknown','不可读取','浏览器未提供所需 API，或读取受到隐私策略限制。');}};
  safe('timezone',()=>{const timezone=win.Intl.DateTimeFormat().resolvedOptions().timeZone;env.timezone=timezone;return result(timezone?'observed':'unknown',timezone||'不可读取','这是当前浏览器报告的时区，不是整个操作系统或所有应用的已验证设置。',[['IANA 时区',timezone||'未提供']]);});
  safe('languages',()=>{const languages=[...(nav.languages||[])];env.languages=languages;return result(languages.length?'observed':'unknown',languages[0]||'不可读取','展示完整语言列表，包括非首选中文；语言是使用偏好，不能证明所在地。',[['首选语言',languages[0]||'未提供'],['完整语言列表',languages.join(', ')||'未提供'],['中文偏好',languages.some(l=>/^zh(?:-|$)/i.test(l))?'列表含中文':'本次列表未见中文']]);});
  safe('locale',()=>{const dt=win.Intl.DateTimeFormat(),n=win.Intl.NumberFormat();const o=dt.resolvedOptions();env.locale=o.locale;return result('observed',o.locale,'浏览器用于日期和数字格式化的区域设置。',[['日期 locale',o.locale],['数字 locale',n.resolvedOptions().locale],['日历',o.calendar],['数字系统',o.numberingSystem],['数字示例',n.format(1234567.89)],['日期示例',dt.format(new Date(Date.UTC(2026,0,15)))]]);});
  safe('offset',()=>{const date=new win.Date(),year=date.getFullYear();env.offset=-date.getTimezoneOffset();return result('observed',offsetLabel(env.offset),'UTC+8 被多个国家和地区采用；1 月与 7 月的差异是季节规则线索。',[['当前偏移',offsetLabel(env.offset)],['1 月偏移',offsetLabel(-new win.Date(year,0,15,12).getTimezoneOffset())],['7 月偏移',offsetLabel(-new win.Date(year,6,15,12).getTimezoneOffset())]]);});
  safe('fonts',()=>fontProbe(doc));safe('emoji',()=>emojiProbe(doc,nav.userAgent||''));
  safe('language-match',()=>consistency(baseLanguage(env.languages?.[0]),baseLanguage(env.locale),'比较首选语言与 Intl 的主语言；差异可能来自正常的用户偏好。'));
  safe('timezone-match',()=>{if(!env.timezone||!Number.isFinite(env.offset))return consistency(null,null,'');return consistency(offsetAtZone(env.timezone,new win.Date()),env.offset,'比较 IANA 时区在当前时刻应有的偏移与 Date 报告值；差异需要核对浏览器覆盖设置。');});
  safe('platform',()=>result('observed',nav.userAgentData?.platform||nav.platform||'未提供','浏览器声明信息可能被精简或修改；自动化标记不是恶意行为或地区判断。',[['User-Agent',nav.userAgent||'未提供'],['平台',nav.platform||'未提供'],['Client Hints',nav.userAgentData?.brands?.map(b=>`${b.brand} ${b.version}`).join(', ')||'未提供'],['移动设备提示',nav.userAgentData?.mobile===undefined?'未提供':String(nav.userAgentData.mobile)],['webdriver',typeof nav.webdriver==='boolean'?String(nav.webdriver):'未提供']]));
  safe('graphics',()=>{const c=doc.createElement('canvas'),gl=c.getContext('webgl')||c.getContext('experimental-webgl');if(!gl)throw new Error();try{const ext=gl.getExtension('WEBGL_debug_renderer_info'),vendor=gl.getParameter(ext?ext.UNMASKED_VENDOR_WEBGL:gl.VENDOR),renderer=gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER);return result('observed',renderer,'只读取图形 API 暴露的字段；隐私模式可能返回通用值，不推断地区。',[['厂商',vendor],['渲染器',renderer],['WebGL 版本',gl.getParameter(gl.VERSION)],['详细字段',ext?'可用':'仅通用值']]);}finally{gl.getExtension('WEBGL_lose_context')?.loseContext();}});
  safe('display',()=>result('observed',`${win.screen.width} × ${win.screen.height} · ${win.devicePixelRatio}×`,'反映当前显示与输入能力，窗口缩放和远程桌面会改变这些值。',[['屏幕',`${win.screen.width} × ${win.screen.height}`],['可用区域',`${win.screen.availWidth} × ${win.screen.availHeight}`],['视口',`${win.innerWidth} × ${win.innerHeight}`],['DPR',win.devicePixelRatio],['色深',win.screen.colorDepth],['触控点',nav.maxTouchPoints??'未提供'],['精确指针',win.matchMedia('(pointer:fine)').matches?'是':'否']]));
  safe('privacy',()=>result('observed',win.isSecureContext?'安全上下文':'非安全上下文','只展示浏览器公开设置；DNT/GPC 是偏好信号，不保证网站遵守。不会写入 Cookie 或本地存储。',[['安全上下文',String(win.isSecureContext)],['Cookie 开关',String(nav.cookieEnabled)],['Do Not Track',nav.doNotTrack??'未提供'],['Global Privacy Control',nav.globalPrivacyControl===undefined?'未提供':String(nav.globalPrivacyControl)],['WebRTC API',typeof win.RTCPeerConnection==='function'?'可用':'未开放']]));
  return {env,checks};
}
