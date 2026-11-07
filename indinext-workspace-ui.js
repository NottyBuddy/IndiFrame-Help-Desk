/* INDINEXT shared workspace navigation enhancement. Presentation only. */
(function(){
  "use strict";
  const body=document.body;
  const path=location.pathname.split("/").pop()||"dashboard.html";
  const nav=document.querySelector("body:not(.if-login) .nav");
  const links=[
    ["dashboard.html","Overview","⌂"],
    ["call-performance.html","Call Performance","CP"],
    ["breaks.html","Breaks","BR"],
    ["admin-section.html","Admin Section","AD"],
    ["weekly-data.html","Weekly Data","WD"],
    ["superadmin.html","Super Admin","SA"],
    ["change-password.html","Change Password","PW"]
  ];
  const makeWorkspaceNav=()=>{
    const bar=document.createElement("nav");
    bar.className="if-workspace-nav";
    bar.setAttribute("aria-label","Workspace navigation");
    links.forEach(([href,label,short])=>{
      const a=document.createElement("a");
      a.href=href;
      a.className="if-workspace-link";
      a.innerHTML='<span class="if-workspace-short" aria-hidden="true">'+short+'</span><span>'+label+'</span>';
      if(path===href){a.classList.add("is-current");a.setAttribute("aria-current","page");}
      bar.appendChild(a);
    });
    return bar;
  };
  const topbar=document.querySelector(".topbar");
  if(topbar&&!nav){
    topbar.insertAdjacentElement("afterend",makeWorkspaceNav());
  }else if(!topbar&&!nav&&document.querySelector(".panel")){
    const header=document.createElement("header");
    header.className="topbar if-auth-topbar";
    header.innerHTML='<div><div class="brand">INDINEXT</div><div class="subtitle">Secure Account Settings</div></div><div class="topright"><a class="logout-btn" href="dashboard.html">Dashboard</a></div>';
    document.body.insertBefore(header,document.body.querySelector("main.panel"));
    header.insertAdjacentElement("afterend",makeWorkspaceNav());
  }
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