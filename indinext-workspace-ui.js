/* INDINEXT shared workspace navigation enhancement. Presentation only. */
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
    const decorate=()=>{
      nav.querySelectorAll("button:not(.if-sidebar-toggle),a").forEach(el=>{
        const label=(el.textContent||"").trim();
        if(label){el.setAttribute("aria-label",label);el.setAttribute("title",label);}
      });
    };
    nav.insertBefore(toggle,nav.firstChild);
    const observer=new MutationObserver(()=>{
      if(!toggle.isConnected)nav.insertBefore(toggle,nav.firstChild);
      decorate();
    });
    observer.observe(nav,{childList:true});
    decorate();
    const setCollapsed=collapsed=>{
      body.classList.toggle("if-sidebar-collapsed",collapsed);
      toggle.setAttribute("aria-expanded",String(!collapsed));
      toggle.textContent=collapsed?"☰  Expand navigation":"☰  Collapse navigation";
      toggle.setAttribute("aria-label",collapsed?"Expand navigation":"Collapse navigation");
    };
    toggle.addEventListener("click",()=>setCollapsed(!body.classList.contains("if-sidebar-collapsed")));
  }
  const brand=document.querySelector(".topbar .brand");
  if(brand&&/indinext/i.test(brand.textContent))brand.textContent="INDINEXT";
})();