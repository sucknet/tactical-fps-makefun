import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>existsSync(p));
const browser=await chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=default','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}});
page.on('pageerror',e=>console.log('[pageerror]',String(e).slice(0,400)));
// Use context init script to trace getElementById('play') calls + which returns what
const ctx = await page.goto('http://localhost:8125/index.html',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2000));
// Instead: fetch hud.js served content and compare to disk
const served = await page.evaluate(async()=>{const r=await fetch('/src/hud.js');return (await r.text()).length});
console.log('served hud.js bytes:',served);
await browser.close(); process.exit(0);
