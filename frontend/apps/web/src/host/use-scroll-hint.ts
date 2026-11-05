'use client';
import {useEffect,useRef,useState} from 'react';
import {hasContentBelow,scrollStep} from './scroll-metrics';

export function useScrollHint(enabled:boolean,contentVersion:string){
 const scrollRef=useRef<HTMLDivElement>(null),contentRef=useRef<HTMLDivElement>(null);
 const[canScrollDown,setCanScrollDown]=useState(false);
 useEffect(()=>{
  const element=scrollRef.current,content=contentRef.current;
  if(!element||!enabled){setCanScrollDown(false);return;}
  let frame=0,disposed=false;
  const measure=()=>{frame=0;if(!disposed){const next=hasContentBelow(element.scrollHeight,element.clientHeight,element.scrollTop);setCanScrollDown(previous=>previous===next?previous:next);}};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  const observer=new ResizeObserver(schedule);observer.observe(element);if(content)observer.observe(content);
  element.addEventListener('scroll',schedule,{passive:true});schedule();
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();element.removeEventListener('scroll',schedule);};
 },[enabled,contentVersion]);
 function scrollDown(){const element=scrollRef.current;if(!element)return;const mode=document.documentElement.dataset.motionMode;
  const reduced=mode==='off'||mode==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.focus({preventScroll:true});element.scrollBy({top:scrollStep(element.clientHeight),behavior:reduced?'instant':'smooth'});
 }
 return {scrollRef,contentRef,canScrollDown:enabled&&canScrollDown,scrollDown};
}
