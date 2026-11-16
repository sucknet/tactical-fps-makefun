import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>existsSync(p));
const browser=await chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=default','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}});
page.on('pageerror',async e=>{
  console.log('[pageerror]',String(e).slice(0,600));
  console.log('[stack]', e.stack ? e.stack.split('\n').slice(0,6).join(' | ') : 'no stack');
});
await page.goto('http://localhost:8125/index.html',{waitUntil:'load'});
await new Promise(r=>setTimeout(r,2500));
await browser.close(); process.exit(0);
