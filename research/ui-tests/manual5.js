const assert=require('assert'),{chromium}=require('playwright'),path=require('path');
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}}),errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+path.resolve(__dirname,'../../manual/Инструкция.html'));await p.waitForTimeout(1500);
assert.strictEqual(await p.locator('#server').count(),1);assert.strictEqual(await p.locator('#fib-time').count(),1);
assert.deepStrictEqual(await p.evaluate(()=>Array.from(document.querySelectorAll('a[href^="#"]')).filter(a=>!document.getElementById(a.getAttribute('href').slice(1))).map(a=>a.getAttribute('href'))),[]);
assert.strictEqual(await p.locator('img').evaluateAll(xs=>xs.filter(x=>!x.complete||x.naturalWidth===0).length),0);
for(const id of ['server','fib-time']){await p.locator('#'+id).scrollIntoViewIfNeeded();await p.screenshot({path:path.join(__dirname,'shots/manual5-'+id+'.png')});}
assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.deepStrictEqual(errs,[]);console.log('Инструкция 5: ссылки, изображения, реальные графики и мобильная ширина — ОК.');await b.close();})().catch(e=>{console.error(e);process.exit(1);});
