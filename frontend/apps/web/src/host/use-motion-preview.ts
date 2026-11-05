import {useEffect,useState} from 'react';
/** Component calibration only. System motion preferences remain the product default. */
export function useMotionPreview(){
 const[reduced,setReduced]=useState(false);
 const[slow,setSlow]=useState(false);
 useEffect(()=>{const before=document.documentElement.dataset.motionMode;if(reduced)document.documentElement.dataset.motionMode='reduced';else delete document.documentElement.dataset.motionMode;return()=>{if(before)document.documentElement.dataset.motionMode=before;else delete document.documentElement.dataset.motionMode;};},[reduced]);
 useEffect(()=>{const root=document.documentElement,before=root.style.getPropertyValue('--motion-debug-scale');if(slow)root.style.setProperty('--motion-debug-scale','4');return()=>{if(before)root.style.setProperty('--motion-debug-scale',before);else root.style.removeProperty('--motion-debug-scale');};},[slow]);
 return [reduced,setReduced,slow,setSlow] as const;
}
