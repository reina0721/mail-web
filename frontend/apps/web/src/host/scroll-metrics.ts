export function hasContentBelow(scrollHeight:number,clientHeight:number,scrollTop:number,enabled=true){
 return enabled&&clientHeight>0&&Number.isFinite(scrollHeight+clientHeight+scrollTop)&&scrollHeight-clientHeight-Math.max(0,scrollTop)>2;
}
export function scrollStep(clientHeight:number){return Math.max(0,clientHeight)*0.8;}
