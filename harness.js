// Loads the <script> of app.patched.html into a vm context with a fake DOM, so the REAL functions are tested.
const fs = require("fs"), vm = require("vm");
function load(file = "app.html") {
  const html = fs.readFileSync(file, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const code = scripts[scripts.length - 1];
  const els = {};
  class El {
    constructor(id){ this.id=id; this.value=""; this.textContent=""; this.innerHTML=""; this.style={}; this.files=[]; this.dataset={};
      const set=new Set(); this.classList={toggle:(c,f)=>{f?set.add(c):set.delete(c)}, add:c=>set.add(c), remove:c=>set.delete(c), contains:c=>set.has(c)}; }
    addEventListener(){} reset(){} }
  const document = { getElementById:id=>els[id]||(els[id]=new El(id)), querySelectorAll:()=>[] };
  const store = {};
  const ctx = { document, console, Date, Math, JSON, String, Number, Object, Array, Map, Set, RegExp, Error, Promise, isNaN, Intl,
    localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)}},
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}}, fetch:()=>Promise.reject(new Error("no network")),
    XLSX:{}, window:{confirm:()=>true}, setTimeout, els };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.run = s => vm.runInContext(s, ctx);
  return ctx;
}
module.exports = { load };
