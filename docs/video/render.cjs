const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
  const b = await chromium.launch();
  const c = await b.newContext({ viewport:{width:1920,height:1080}, recordVideo:{dir:'out',size:{width:1920,height:1080}} });
  const p = await c.newPage();
  await p.goto('file://'+process.cwd()+'/intro.html');
  await p.waitForTimeout(23500);
  await c.close(); await b.close();
})();
