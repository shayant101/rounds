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
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), out);
const prog = fs.readFileSync(path.join(root, 'public', 'program.html'), 'utf8').replace('window.__CLIENTS__=null;/*CLIENTS*/', () => `window.__CLIENTS__=${clients};`).replace(/<link rel="icon" href="icon.svg">/, `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">`);
fs.writeFileSync(path.join(root, 'dist', 'program.html'), prog);
console.log('wrote dist/program.html');
console.log('wrote dist/index.html', (out.length / 1024).toFixed(0) + ' KB');
