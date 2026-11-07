/* INDINEXT shared workspace navigation enhancement. No API or data logic. */
(function(){
  "use strict";
  const body=document.body;
  const nav=document.querySelector("body:not(.if-login) .nav");
  if(nav){
    const toggle=document.createElement("button");
    toggle.type="button";
    toggle.className="if-sidebar-toggle";
    toggle.setAttribute("aria-controls","if-dashboard-navigation");
    toggle.setAttribute("aria-expanded","true");
    toggle.textContent="☰  Collapse navigation";
    nav.id="if-dashboard-navigation";
    nav.insertBefore(toggle,nav.firstChild);
    const labels=new Map();
    nav.querySelectorAll("button,a").forEach(el=>{
      const label=(el.textContent||"").trim();
      if(label){el.setAttribute("aria-label",label);el.setAttribute("title",label);labels.set(el,label);}
    });
    const setCollapsed=(collapsed)=>{
      body.classList.toggle("if-sidebar-collapsed",collapsed);
      toggle.setAttribute("aria-expanded",String(!collapsed));
      toggle.textContent=collapsed?"☰  Expand navigation":"☰  Collapse navigation";
      toggle.setAttribute("aria-label",collapsed?"Expand navigation":"Collapse navigation");
    };
    toggle.addEventListener("click",()=>setCollapsed(!body.classList.contains("if-sidebar-collapsed")));
    if(window.matchMedia&&window.matchMedia("(max-width: 900px)").matches)setCollapsed(false);
  }
  // Standardize the identity label across all authenticated workspaces.
  const brand=document.querySelector(".topbar .brand");
  if(brand&&/indinext/i.test(brand.textContent))brand.textContent="INDINEXT";
})();