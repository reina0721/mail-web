'use client';
import {useEffect,useState} from 'react';

/** Setup capability stays in memory; fragments never reach HTTP access logs. */
export function useSetupAccess(){
 const[token,setToken]=useState(''),[origin,setOrigin]=useState('');
 useEffect(()=>{const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);const suppliedOrigin=new URLSearchParams(location.search).get('public_origin');let initial=location.origin;if(local&&suppliedOrigin){try{const parsed=new URL(suppliedOrigin);if(['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password&&parsed.pathname==='/'&&!parsed.search&&!parsed.hash)initial=parsed.origin;}catch{}}setOrigin(initial);const fragment=new URLSearchParams(location.hash.slice(1));const supplied=fragment.get('setup_token');if(supplied){setToken(supplied);fragment.delete('setup_token');history.replaceState(history.state,'',location.pathname+location.search+(fragment.size?'#'+fragment.toString():''));}},[]);
 return {token,setToken,origin};
}
