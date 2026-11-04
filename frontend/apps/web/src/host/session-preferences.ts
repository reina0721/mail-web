'use client';
import {useEffect} from 'react';
import {api} from '../lib/api';
import {usePreferences} from './providers';

export function useSessionPreferences(identity:string|undefined){
 useEffect(()=>{
  if(!identity){usePreferences.getState().setTheme('system');return;}
  let active=true;
  void api<{preferences:{theme?:string}}>('/account').then(profile=>{
   if(!active)return;
   const theme=profile.preferences.theme;
   usePreferences.getState().setTheme(theme&&['system','light','dark'].includes(theme)?theme:'system');
  }).catch(()=>{});
  return()=>{active=false;};
 },[identity]);
}
