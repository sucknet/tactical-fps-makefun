import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>existsSync(p));
const browser=await chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=default','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,200)));
await page.goto('http://localhost:8125/index.html',{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1500));
const probe = await page.evaluate(() => {
  const ids=['play','buy-list','buy-close','keys-hint','overlay','hud','health','timer'];
  const out={};
  for(const id of ids) out[id]=!!document.getElementById(id);
  out.bodyChildren=[...document.body.children].map(c=>c.id||c.tagName);
  out.overlays=[...document.querySelectorAll('.overlay')].length;
  return out;
});
console.log('probe:',JSON.stringify(probe));
console.log('errs:',errs);
await browser.close(); process.exit(0);
