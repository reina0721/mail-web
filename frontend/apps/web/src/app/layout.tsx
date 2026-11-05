import type { ReactNode } from 'react';
import './styles.css';
import {Providers} from '../host/providers';
export const metadata = { title: 'Mail Web', description: '邮箱工作台' };
export default function Layout({children}:{children:ReactNode}) { return <html lang="zh-CN"><body className="bg-surface text-ink"><Providers>{children}</Providers></body></html>; }
