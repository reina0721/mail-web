import createClient from 'openapi-fetch';
import type {paths} from './generated-api';
import {ApiError,csrfToken} from './api';

export const contractClient=createClient<paths>({credentials:'same-origin',cache:'no-store'});
contractClient.use({onRequest({request}){
 if(request.method!=='GET'&&request.method!=='HEAD'){
  const token=csrfToken();if(token)request.headers.set('X-CSRF-Token',token);
 }
 return request;
}});
export function unwrapContract<T>(result:{data?:T;error?:unknown;response:Response}):T{
 if(!result.response.ok){
  const error=result.error;
  const code=typeof error==='object'&&error!==null&&'code' in error&&typeof error.code==='string'?error.code:'unavailable';
  throw new ApiError(result.response.status,code);
 }
 return result.data as T;
}
