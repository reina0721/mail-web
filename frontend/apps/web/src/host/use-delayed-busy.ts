import {useEffect,useState} from 'react';
/** Suppress loading flashes while preserving a fixed-size pending region. */
export function useDelayedBusy(busy:boolean){
 const[visible,setVisible]=useState(false);
 useEffect(()=>{if(!busy){setVisible(false);return;}const timer=setTimeout(()=>setVisible(true),150);return()=>clearTimeout(timer);},[busy]);
 return busy&&visible;
}
