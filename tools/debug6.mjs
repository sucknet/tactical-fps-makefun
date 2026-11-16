import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>existsSync(p));
const browser=await chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=default','--enable-unsafe-swiftshader']});
for (const shot of ['play','end']) {
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>console.log(`[pageerror ${shot}]`,String(e).slice(0,600)));
  page.on('console',m=>{if(m.type()==='error')console.log(`[console ${shot}]`,m.text().slice(0,200))});
  await page.goto(`http://localhost:8125/index.html?shot=${shot}&seed=7`,{waitUntil:'load'});
  try { await page.waitForFunction('window.__shotReady === true',null,{timeout:8000}); console.log(shot,'READY'); }
  catch { console.log(shot,'TIMEOUT'); const st=await page.evaluate(()=>({bp:typeof window.__bp, shotReady:window.__shotReady, err:window.__lastError||null})); console.log('  state:',JSON.stringify(st)); }
  await page.close();
}
await browser.close(); process.exit(0);
