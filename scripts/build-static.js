#!/usr/bin/env node
// Builds dist/index.html: the whole app in one file, demo mode only (no API key, no server).
// Used for the hosted demo link and for GitHub Pages. `npm start` is still the real thing.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const verify = fs.readFileSync(path.join(root, 'public', 'verify.js'), 'utf8');
const clients = fs.readFileSync(path.join(root, 'data', 'clients.json'), 'utf8');
const mocks = fs.readFileSync(path.join(root, 'data', 'mock-outputs.json'), 'utf8');
const icon = fs.readFileSync(path.join(root, 'public', 'icon.svg'), 'utf8');
const medrec = fs.readFileSync(path.join(root, 'public', 'medrec.js'), 'utf8');
const csvO = fs.readFileSync(path.join(root, 'data', 'sample-kipu-orders.csv'), 'utf8');
const csvM = fs.readFileSync(path.join(root, 'data', 'sample-kipu-mar.csv'), 'utf8');

const shim = `<script>
(function(){
  const CLIENTS=${clients}; const MOCKS=${mocks}; const CSV_O=${JSON.stringify(csvO)}; const CSV_M=${JSON.stringify(csvM)};
  const norm=s=>String(s||'').toLowerCase().replace(/\\s+/g,' ').trim();
  const json=(o,status=200)=>Promise.resolve({ok:status<300,status,json:()=>Promise.resolve(o)});
  const real=window.fetch.bind(window);
  window.fetch=function(url,opts){
    if(typeof url==='string'&&(url.startsWith('/api/')||url.startsWith('/data/'))){
      if(url==='/api/health') return json({ok:true,mode:'mock',models:[]});
      if(url==='/api/clients') return json({clients:CLIENTS.clients});
      if(url==='/data/sample-kipu-orders.csv') return Promise.resolve({ok:true,text:()=>Promise.resolve(CSV_O)});
      if(url==='/data/sample-kipu-mar.csv') return Promise.resolve({ok:true,text:()=>Promise.resolve(CSV_M)});
      if(url==='/api/draft'){ const b=JSON.parse(opts.body||'{}'); const c=CLIENTS.clients.find(x=>x.id===b.clientId);
        if(c&&MOCKS[c.id]&&norm(b.jottings)===norm(c.sample_jottings)) return json({mode:'mock',model:'sample',draft:MOCKS[c.id]});
        return json({error:'This hosted demo can only write up the sample sheet. Run it with an API key to write up your own lines.'},503); }
    }
    return real(url,opts);
  };
})();
</script>`;

let out = html
  .replace('<script src="verify.js"></script>', () => `<script>${verify}</script><script>${medrec}</script>` + shim)
  .replace('<script src="medrec.js"></script>', '')
  .replace('<link rel="manifest" href="manifest.json">', '')
  .replace(/<link rel="icon" href="icon.svg">/, `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">`)
  .replace(/<link rel="apple-touch-icon" href="icon.svg">/, '');
fs.mkdirSync(path.join(root, 'dist', 'app'), { recursive: true }); fs.mkdirSync(path.join(root, 'dist', 'brand'), { recursive: true }); fs.readdirSync(path.join(root, 'public', 'brand')).forEach(f => fs.copyFileSync(path.join(root, 'public', 'brand', f), path.join(root, 'dist', 'brand', f))); fs.mkdirSync(path.join(root, 'dist', 'program'), { recursive: true });

const b64=f=>'data:image/png;base64,'+fs.readFileSync(path.join(root,'public','brand',f)).toString('base64');
out = out.split('brand/mark-grey.png').join(b64('mark-grey-128.png')).split('brand/mark-black.png').join(b64('mark-black-128.png')).split('brand/').join('../brand/');
fs.writeFileSync(path.join(root, 'dist', 'app', 'index.html'), out);
const landing = fs.readFileSync(path.join(root, 'public', 'landing.html'), 'utf8').replace(/<link rel="icon" href="icon.svg">/, `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">`);
fs.writeFileSync(path.join(root, 'dist', 'index.html'), landing);
const prog = fs.readFileSync(path.join(root, 'public', 'program.html'), 'utf8').replace('window.__CLIENTS__=null;/*CLIENTS*/', () => `window.__CLIENTS__=${clients};`).replace(/<link rel="icon" href="icon.svg">/, `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">`);
fs.writeFileSync(path.join(root, 'dist', 'program', 'index.html'), prog.split('brand/').join('../brand/'));
fs.mkdirSync(path.join(root, 'dist', 'views'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'views', 'index.html'), fs.readFileSync(path.join(root, 'public', 'views.html'), 'utf8').split('brand/').join('../brand/').replace(/<link rel="icon" href="icon.svg">/, `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">`));
console.log('wrote dist/index.html (landing), dist/app/, dist/program/, dist/views/');
