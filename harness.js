// Minimal VM harness for the Call Performance workbook importer.
const fs = require("fs"), vm = require("vm");
function load(file = "call-performance-import.js") {
  const code = fs.readFileSync(file, "utf8");
  const els = {};
  class El {
    constructor(id) {
      this.id=id; this.value=""; this.textContent=""; this.innerHTML="";
      this.style={}; this.files=[]; this.dataset={}; this.disabled=false;
      this.className=""; this.listeners={};
    }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    reset() {}
  }
  const document = {
    getElementById:id=>els[id]||(els[id]=new El(id)),
    addEventListener(){}, querySelectorAll:()=>[], createElement:()=>new El("created")
  };
  const XLSX = { utils: { sheet_to_json: sheet => sheet } };
  const ctx = {
    document, console, Date, Math, JSON, String, Number, Object, Array, Map, Set, XLSX,
    RegExp, Error, Promise, isNaN, Intl, XLSX,
    window:{XLSX, IndiFrameAPI:{apiRequest:async()=>({}),clearToken(){}}},
    location:{replace(){}}, setTimeout, confirm:()=>true, els
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  // Expose parser in both the namespaced and legacy global forms for regression tests.
  ctx.parseCallSheet = ctx.window.__callPerformanceTestHooks?.parseCallSheet;
  ctx.run = s => vm.runInContext(s, ctx);
  return ctx;
}
module.exports = { load };
