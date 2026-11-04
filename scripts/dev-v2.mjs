import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createV2Handler} from '../worker/v2-handler.mjs';
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const data=JSON.parse(fs.readFileSync(path.join(root,'v2/survey.json'),'utf8'));
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../migrations/0002_survey_v2_test.sql',import.meta.url),'utf8'));
const DB={prepare(sql){const statement=db.prepare(sql);return {bind:(...args)=>({first:async()=>statement.get(...args)||null,run:async()=>({meta:{changes:Number(statement.run(...args).changes)}})})};}};
const env={DB,ENVIRONMENT:'development',SURVEY_V2_COLLECTION_ENABLED:'true',TURNSTILE_SITE_KEY:'1x00000000000000000000AA',SURVEY_V2_TURNSTILE_SECRET:'1x0000000000000000000000000000000AA'};
const handle=createV2Handler(data),types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.csv':'text/csv; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    const origin=(req.headers['x-forwarded-proto']||'http')+'://'+req.headers.host,url=new URL(req.url,origin);
    if(url.pathname.startsWith('/api/v2/')){
      const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>150000){res.writeHead(413).end();return;}chunks.push(chunk);}
      const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
      const response=await handle(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404).end('Not found');return;}
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
  }catch(e){res.writeHead(500,{'content-type':'text/plain'}).end('Local preview error');}
});
server.listen(Number(process.env.PORT||8000),'0.0.0.0',()=>console.log('PULSE v2 development preview is ready. Test storage is in memory only.'));
