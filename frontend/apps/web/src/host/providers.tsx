'use client';
import {useEffect,type ReactNode} from 'react';
import {createFrontendI18n,FrontendI18nProvider} from '@community-go/i18n';
import {createAppStore} from '@community-go/state-foundation';
export const i18n=createFrontendI18n({defaultLocale:'zh-CN',supportedLocales:['zh-CN','en'],resources:{'zh-CN':{translation:{brand:'IQWQ Mail',welcome:'欢迎回来',create:'创建你的邮箱',recover:'找回邮箱密码'}},en:{translation:{brand:'IQWQ Mail',welcome:'Welcome back',create:'Create your mailbox',recover:'Recover your mailbox'}}}});
export const usePreferences=createAppStore<{theme:string;setTheme:(theme:string)=>void}>(set=>({theme:'system',setTheme:theme=>set({theme})}));
export function Providers({children}:{children:ReactNode}){
 const theme=usePreferences(state=>state.theme);
 useEffect(()=>{const query=matchMedia('(prefers-color-scheme: dark)');const apply=()=>{document.documentElement.dataset.theme=theme==='system'?(query.matches?'dark':'light'):theme;};apply();query.addEventListener('change',apply);return()=>query.removeEventListener('change',apply);},[theme]);
 return <FrontendI18nProvider runtime={i18n}>{children}</FrontendI18nProvider>;
}
