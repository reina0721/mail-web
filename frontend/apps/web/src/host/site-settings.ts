import {createAppStore} from '@community-go/state-foundation';
export const useSiteSettings=createAppStore<{brand:string;domain:string;setSite:(site:{brand:string;domain:string})=>void}>(set=>({brand:'Mail Web',domain:'',setSite:site=>set(site)}));
