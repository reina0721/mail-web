'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {Action} from '@community-go/ui-adapter/action';
import {api,errorMessage} from '../lib/api';
import type {components} from '../lib/generated-api';
import {Installation} from './installation-editor';
export {Installation};
type Status=components['schemas']['InstallationStatus'];
export function InstallationGate({children,onSite}:{children:ReactNode;onSite:(site:{brand:string;domain:string})=>void}){
 const[status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setError('');void api<Status>('/installation').then(value=>{if(active){setStatus(value);const brand=value.brand||'Mail Web';onSite({brand,domain:value.domain});}}).catch(e=>{if(active)setError(errorMessage(e));});return()=>{active=false;};},[revision,onSite]);
 if(error)return <main className="installation-shell" role="alert"><h1>无法读取站点配置</h1><p>{error}</p><Action onPress={()=>setRevision(n=>n+1)}>重新连接</Action></main>;
 if(!status)return <main className="installation-shell" role="status">正在读取站点配置…</main>;
 if(!status.configured||status.needsOperator)return <Installation initialStatus={status}/>;
 return children;
}
