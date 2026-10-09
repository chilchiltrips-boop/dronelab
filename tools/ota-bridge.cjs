const http=require('node:http'),crypto=require('node:crypto');

const MAX_IMAGE=2*1024*1024;
function allowedHost(host){const parts=String(host||'').split('.').map(Number);if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
  return parts[0]===10||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31;
}
function localRequest(req){const addr=req.socket.remoteAddress||'',host=req.headers.host||'',origin=req.headers.origin;
  return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(addr)&&/^(localhost|127\.0\.0\.1):\d+$/.test(host)&&(!origin||origin==='http://'+host)&&(!req.headers['sec-fetch-site']||req.headers['sec-fetch-site']==='same-origin');
}
function requestBoard(host,key,method,path,body){return new Promise((resolve,reject)=>{
  const headers={'X-OTA-Key':key};if(body){headers['Content-Type']=body.type;headers['Content-Length']=body.bytes.length}
  const rq=http.request({hostname:host,port:80,path,method,headers,timeout:15000},rs=>{let data='';rs.setEncoding('utf8');rs.on('data',chunk=>{data+=chunk.slice(0,4096);if(data.length>8192)rq.destroy(Error('Device response too long.'))});rs.on('end',()=>{try{const value=JSON.parse(data);if(rs.statusCode!==200||value.ok===false)throw Error(value.error||`Device returned HTTP ${rs.statusCode}`);resolve(value)}catch(e){reject(e)}})});
  rq.on('timeout',()=>rq.destroy(Error('Device did not respond.')));rq.on('error',reject);if(body){let offset=0;const next=()=>{while(offset<body.bytes.length){const end=Math.min(offset+65536,body.bytes.length),more=rq.write(body.bytes.subarray(offset,end));offset=end;body.onProgress?.(offset,body.bytes.length);if(!more){rq.once('drain',next);return}}rq.end()};next()}else rq.end();
})}
function collect(req){return new Promise((resolve,reject)=>{const chunks=[];let size=0;req.on('data',c=>{size+=c.length;if(size>MAX_IMAGE){reject(Error('Application image exceeds 2 MB.'));req.destroy();return}chunks.push(c)});req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject)})}
function reply(res,code,object){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(object))}
async function handleBridge(req,res,url){
  if(!url.pathname.startsWith('/api/device/'))return false;
  if(!localRequest(req)){reply(res,403,{error:'Local bridge accepts only requests from this computer at localhost.'});return true}
  const host=url.searchParams.get('host'),key=req.headers['x-ota-key'];
  if(!allowedHost(host)||typeof key!=='string'||key.length<12||key.length>96){reply(res,400,{error:'Private board IP and OTA key are required.'});return true}
  if(req.method==='GET'&&url.pathname==='/api/device/info'){
    try{reply(res,200,await requestBoard(host,key,'GET','/api/info'))}catch(e){reply(res,502,{error:e.message})}return true;
  }
  if(req.method==='POST'&&url.pathname==='/api/device/firmware'){
    if(req.headers['content-type']!=='application/octet-stream'||+req.headers['content-length']>MAX_IMAGE){reply(res,415,{error:'Expected an application .bin up to 2 MB.'});return true}
    let bytes;try{bytes=await collect(req);if(bytes.length<32768||bytes[0]!==0xe9||(bytes[12]|bytes[13]<<8)!==13)throw Error('Expected an ESP32-C6 application image.');
      const actual=crypto.createHash('sha256').update(bytes).digest('hex');if(actual!==req.headers['x-firmware-sha256'])throw Error('Firmware SHA-256 mismatch.');
      const info=await requestBoard(host,key,'GET','/api/info');if(info.board!=='XIAO_ESP32C6'||info.protocol!=='dronelab-c6-sample-v1'||info.armed!==false)throw Error('Board identity or OTA protocol mismatch.');
      if(bytes.length>Number(info.freeSketchBytes||0))throw Error('Image exceeds available OTA partition.');
    }catch(e){reply(res,400,{error:e.message});return true}
    res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    const send=o=>{if(!res.destroyed)res.write(JSON.stringify(o)+'\n')};
    try{
      const boundary='dronelab'+crypto.randomBytes(12).toString('hex'),header=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="firmware"; filename="sample-app.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),tail=Buffer.from(`\r\n--${boundary}--\r\n`),body=Buffer.concat([header,bytes,tail]);
      const result=await requestBoard(host,key,'POST','/api/firmware',{type:'multipart/form-data; boundary='+boundary,bytes:body,onProgress:(n,total)=>send({phase:'upload',percent:Math.min(100,Math.round(n/total*100))})});
      if(result.ok!==true)throw Error(result.error||'Device did not confirm the update.');
      send({phase:'written',message:result.message||'Firmware accepted for reboot.'});
    }catch(e){send({error:e.message})}finally{res.end()}return true;
  }
  reply(res,404,{error:'No device API at this path.'});return true;
}
module.exports={handleBridge,allowedHost,localRequest};
