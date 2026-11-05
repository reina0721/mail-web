export function normalizeStalwart(value:string){
 const raw=value.trim();if(!raw)return '';
 try{const url=new URL(raw.includes('://')?raw:'https://'+raw);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['/','/admin','/admin/','/account','/account/'].includes(url.pathname))return '';
  return url.origin;
 }catch{return '';}
}
