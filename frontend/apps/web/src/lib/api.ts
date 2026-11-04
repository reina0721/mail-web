export class ApiError extends Error { constructor(public status:number,public code:string){super(code);} }
export async function api<T>(path:string,init:RequestInit={}):Promise<T> {
 const headers=new Headers(init.headers);
 if(init.body && !(init.body instanceof FormData)) headers.set('Content-Type','application/json');
 if(init.method && init.method!=='GET') {
  const csrf=document.cookie.split(';').map(p=>p.trim()).find(p=>p.startsWith('__Host-mail_csrf='))?.split('=')[1];
  if(csrf) headers.set('X-CSRF-Token',csrf);
 }
 const response=await fetch('/api/v1'+path,{...init,headers,credentials:'same-origin',cache:'no-store'});
 if(!response.ok){const error=await response.json().catch(()=>({code:'unavailable'}));throw new ApiError(response.status,error.code);}
 return response.status===204?undefined as T:response.json();
}
