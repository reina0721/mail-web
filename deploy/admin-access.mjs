#!/usr/bin/env node
// Runs on the administrator's computer. No helper is installed on the server.
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function acceptedBrowserRequest(method,url,headers,localOrigin){
 const expected=new URL(localOrigin);
 if(headers.host!==expected.host||typeof url!=='string'||!url.startsWith('/')||url.startsWith('//'))return false;
 if(headers.origin&&headers.origin!==localOrigin)return false;
 return ['GET','HEAD','OPTIONS'].includes(method)||headers.origin===localOrigin;
}
async function main(){
const args=process.argv.slice(2),options={port:4204,sshPort:22};
for(let index=0;index<args.length;index++){
 const key=args[index];
 if(key==='--help'){console.log('node admin-access.mjs --ssh USER@HOST --identity KEY --origin http://HOST:PORT [--port 4204] [--ssh-port 22]');process.exit(0);}
 const value=args[++index];if(!value)throw Error('Missing option value');
 if(key==='--ssh')options.ssh=value;
 else if(key==='--identity')options.identity=value;
 else if(key==='--origin')options.origin=value;
 else if(key==='--port')options.port=Number(value);
 else if(key==='--ssh-port')options.sshPort=Number(value);
 else throw Error('Unknown option '+key);
}
if(!options.ssh||!options.identity||!options.origin)throw Error('Provide --ssh, --identity and --origin. Use --help for syntax.');
if(options.ssh.startsWith('-')||!/^[a-zA-Z0-9_.@:-]+$/.test(options.ssh))throw Error('Invalid SSH destination');
for(const port of [options.port,options.sshPort])if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
const target=new URL(options.origin);
if(target.protocol!=='http:'||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw Error('Use a bare HTTP origin. Connect directly to HTTPS sites with their normal browser URL.');
const reserve=net.createServer();
await new Promise((resolve,reject)=>{reserve.once('error',reject);reserve.listen(0,'127.0.0.1',resolve);});
const tunnelPort=reserve.address().port;
await new Promise(resolve=>reserve.close(resolve));
const ssh=spawn('ssh',['-N','-T','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-i',options.identity,'-p',String(options.sshPort),'-L',`127.0.0.1:${tunnelPort}:${target.hostname}:${target.port||80}`,options.ssh],{stdio:['ignore','ignore','pipe'],windowsHide:true});
ssh.stderr.on('data',chunk=>process.stderr.write(chunk));
ssh.once('error',error=>{console.error(error.message);process.exitCode=1;});
const localOrigin=`http://127.0.0.1:${options.port}`;
let ready=false;
const server=http.createServer((request,response)=>{
 if(!acceptedBrowserRequest(request.method,request.url,request.headers,localOrigin)){response.writeHead(403).end();return;}
 const headers={...request.headers,host:target.host};
 for(const key of ['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-real-ip','proxy-authorization','proxy-connection','connection'])delete headers[key];
 if(request.headers.origin)headers.origin=target.origin;
 const upstream=http.request({hostname:'127.0.0.1',port:tunnelPort,method:request.method,path:request.url,headers},result=>{
  const outgoing={...result.headers};
  if(outgoing.location?.startsWith(target.origin+'/'))outgoing.location=localOrigin+outgoing.location.slice(target.origin.length);
  response.writeHead(result.statusCode??502,outgoing);result.pipe(response);
 });
 upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502);response.end('SSH forwarding unavailable');});
 request.on('aborted',()=>upstream.destroy());response.on('close',()=>upstream.destroy());request.pipe(upstream);
});
const close=()=>{server.close();ssh.kill();};
process.on('SIGINT',()=>{close();process.exit(0);});process.on('SIGTERM',()=>{close();process.exit(0);});
ssh.once('exit',code=>{server.close();if(ready)console.error('SSH tunnel closed.');process.exitCode=code??1;});
for(let attempt=0;attempt<100;attempt++){
 if(ssh.exitCode!==null)throw Error('SSH tunnel did not start');
 try{await new Promise((resolve,reject)=>{const socket=net.connect(tunnelPort,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve();});socket.once('error',reject);});ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}
}
if(!ready){close();throw Error('SSH tunnel startup timed out');}
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(options.port,'127.0.0.1',resolve);}).catch(error=>{close();throw error;});
console.log(`Encrypted SSH forwarding ready. Open ${localOrigin}/setup/?public_origin=${encodeURIComponent(target.origin)}`);
console.log('Use the installation management token. The proxy stays on loopback and enforces the local browser origin before forwarding. Ctrl+C closes it.');

}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
