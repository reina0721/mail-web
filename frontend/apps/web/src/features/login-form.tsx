'use client';
import {useState} from 'react';
import {z} from 'zod';
import {FoundationForm,useFoundationForm} from '@community-go/form-foundation';
import {TextField,PasswordField} from '@community-go/ui-adapter/form-field';
import {Action} from '@community-go/ui-adapter/action';
import {ApiError} from '../lib/api';
import {contractClient,unwrapContract} from '../lib/contract-client';
import type {Session} from './auth';

const loginSchema=z.object({email:z.email().max(254),password:z.string().min(1).max(512)});
export function LoginForm({initialEmail,onLogin}:{initialEmail:string;onLogin:(session:Session)=>void}){
 const[notice,setNotice]=useState('');
 const form=useFoundationForm({schema:loginSchema,defaultValues:{email:initialEmail,password:''}});
 return <FoundationForm className="flex flex-col gap-4" form={form} onSubmit={async values=>{
  setNotice('');
  try{
   unwrapContract(await contractClient.POST('/api/v1/auth/login',{body:values}));
   form.reset({email:values.email,password:''});
   onLogin(unwrapContract(await contractClient.GET('/api/v1/auth/session')));
  }catch(error){
   form.setValue('password','',{dirty:false});
   setNotice(error instanceof ApiError&&error.status===429?'尝试次数较多，请稍后再登录':error instanceof ApiError&&error.status===401?'邮箱地址或密码不正确':'暂时无法登录，请稍后重试');
  }
 }}>
  <TextField label="邮箱地址" purpose="email" autoComplete="username" disabled={form.isSubmitting} error={form.hasError('email')?'请输入完整的邮箱地址':undefined} {...form.registerField('email')}/>
  <PasswordField label="密码" purpose="current" showLabel="显示密码" hideLabel="隐藏密码" disabled={form.isSubmitting} error={form.hasError('password')?'请输入密码':undefined} {...form.registerField('password')}/>
  <Action type="submit" loading={form.isSubmitting}>登录邮箱</Action>
  {notice&&<p role="alert">{notice}</p>}
 </FoundationForm>;
}
