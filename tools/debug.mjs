import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>existsSync(p));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const server = spawn('node',['serve.ts','--port','8124'],{cwd:process.cwd()+'/..',stdio:'pipe'});
for(let i=0;i<40;i++){try{const r=await fetch('http://localhost:8125/index.html');if(r.ok)break}catch{}await wait(250)}
const browser=await chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=default','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}});
page.on('console',m=>console.log('[console:'+m.type()+']',m.text().slice(0,300)));
page.on('pageerror',e=>console.log('[pageerror]',String(e).slice(0,500)));
page.on('requestfailed',r=>console.log('[reqfail]',r.url(),r.failure()?.errorText));
await page.goto('http://localhost:8125/index.html',{waitUntil:'load'});
await wait(3000);
const st=await page.evaluate(()=>({bp:typeof window.__bp, ready:typeof window.__shotReady, scripts:[...document.querySelectorAll('script')].map(s=>s.src||'inline')}));
console.log('state:',JSON.stringify(st));
await browser.close(); server.kill(); process.exit(0);
