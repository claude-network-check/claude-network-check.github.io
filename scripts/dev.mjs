import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=spawnSync(process.execPath,[path.join(root,'scripts/build.mjs')],{stdio:'inherit'});if(build.status)process.exit(build.status);
const base=path.join(root,'dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.md':'text/plain; charset=utf-8','.yaml':'text/plain; charset=utf-8','.zip':'application/zip'};
const server=createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    // Preview the same build under a project subpath, as GitHub Pages serves it.
    if(pathname.startsWith('/claude-network-check/'))pathname=pathname.slice('/claude-network-check'.length);
    let target=path.resolve(base,`.${pathname}`);
    if(target!==base&&!target.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}
    if((await stat(target)).isDirectory())target=path.join(target,'index.html');
    const body=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Preview: http://127.0.0.1:${server.address().port}`));
