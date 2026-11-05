'use client';
import {useEffect,useRef,useState} from 'react';
export function useInstallationLeave(dirty:boolean){
 const[href,setHref]=useState('');
 const cleanup=useRef<()=>void>(()=>{});
 useEffect(()=>{if(!dirty)return;
  const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
  const click=(e:MouseEvent)=>{if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;const link=e.target instanceof Element?e.target.closest('a[href]'):null;if(!link||link.getAttribute('target')==='_blank')return;const target=link.getAttribute('href');if(!target||target.startsWith('#'))return;e.preventDefault();e.stopPropagation();setHref(target);};
  window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);
  const remove=()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);};cleanup.current=remove;return remove;
 },[dirty]);
 return {href,cancel:()=>setHref(''),leave:()=>{cleanup.current();location.assign(href);}};
}
