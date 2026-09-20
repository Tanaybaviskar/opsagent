export const HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpsAgent</title><style>
body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:16px;background:#f6f6f7}
h1{font-size:20px} #log{background:#fff;border-radius:8px;padding:12px;height:60vh;overflow:auto}
.m{margin:8px 0;white-space:pre-wrap}.u{color:#0b5}.a{color:#111}.t{color:#888;font-size:12px}
form{display:flex;gap:8px;margin-top:8px}input{flex:1;padding:10px;border:1px solid #ccc;border-radius:6px}
button{padding:10px 14px;border:0;border-radius:6px;background:#f6821f;color:#fff;cursor:pointer}
</style></head><body><h1>OpsAgent - infra incident assistant</h1>
<div id="log"></div>
<form id="f"><input id="i" placeholder="e.g. Why is auth-service slow?" autocomplete="off"><button>Send</button><button type="button" id="r" style="background:#666">Reset</button></form>
<script>
const sid=localStorage.sid||(localStorage.sid=crypto.randomUUID());
const log=document.getElementById('log'),inp=document.getElementById('i');
const add=(c,t)=>{const d=document.createElement('div');d.className='m '+c;d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight;return d};
fetch('/history?session='+sid).then(r=>r.json()).then(h=>h.forEach(m=>add(m.role=='user'?'u':'a',(m.role=='user'?'You: ':'Agent: ')+m.content)));
document.getElementById('f').onsubmit=async e=>{e.preventDefault();const q=inp.value.trim();if(!q)return;inp.value='';
add('u','You: '+q);const w=add('t','investigating...');
try{const r=await fetch('/chat?session='+sid,{method:'POST',body:JSON.stringify({message:q})});const d=await r.json();
w.remove();if(d.trace&&d.trace.length)add('t','tools: '+d.trace.join(' -> '));add('a','Agent: '+(d.reply||d.error||'error'))}catch(x){w.textContent='error: '+x}};
document.getElementById('r').onclick=async()=>{await fetch('/reset?session='+sid,{method:'POST'});log.innerHTML=''};
</script></body></html>`;
