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
      a.dataset.workspaceHref=href;
      a.innerHTML='<span class="if-workspace-short" aria-hidden="true">'+short+'</span><span>'+label+'</span>';
      if(path===href){a.classList.add("is-current");a.setAttribute("aria-current","page");}
      bar.appendChild(a);
    });
    return bar;
  };
  const applyRoleNavigation=async bar=>{
    const forced=sessionStorage.getItem("forcePasswordChange")==="true";
    if(forced){
      bar?.remove();
      document.querySelector(".if-auth-topbar .topright")?.replaceChildren();
      return;
    }
    try{
      const token=sessionStorage.getItem("indiframe_token")||"";
      if(!token)throw new Error("No session");
      const response=await fetch("https://indiframe-helpdesk-api.mukuls2302.workers.dev/api/me",{headers:{Accept:"application/json",Authorization:"Bearer "+token}});
      if(!response.ok)throw new Error("Session unavailable");
      const payload=await response.json();
      const user=payload.user||payload;
      const role=String(user.role||user.userRole||"").toLowerCase().replace(/[ _-]/g,"");
      const isSuper=role==="superadmin"||user.isSuperAdmin===true||Number(user.isSuperAdmin)===1;
      const isAdmin=isSuper||role==="admin";
      const allowed=new Set(["dashboard.html","call-performance.html","change-password.html"]);
      if(!isAdmin)allowed.add("breaks.html");
      if(isAdmin)allowed.add("admin-section.html");
      if(isSuper){allowed.add("weekly-data.html");allowed.add("superadmin.html");}
      bar?.querySelectorAll("[data-workspace-href]").forEach(link=>{
        if(!allowed.has(link.dataset.workspaceHref))link.remove();
      });
    }catch(_){
      bar?.querySelectorAll("[data-workspace-href]").forEach(link=>{
        if(!["dashboard.html","change-password.html"].includes(link.dataset.workspaceHref))link.remove();
      });
    }
  };
  const topbar=document.querySelector(".topbar");
  if(topbar&&!nav){
    const bar=makeWorkspaceNav();
    topbar.insertAdjacentElement("afterend",bar);
    applyRoleNavigation(bar);
  }else if(!topbar&&!nav&&document.querySelector(".panel")){
    const header=document.createElement("header");
    header.className="topbar if-auth-topbar";
    header.innerHTML='<div><div class="brand">INDINEXT</div><div class="subtitle">Secure Account Settings</div></div><div class="topright"><a class="logout-btn" href="dashboard.html">Dashboard</a></div>';
    document.body.insertBefore(header,document.body.querySelector("main.panel"));
    const bar=makeWorkspaceNav();
    header.insertAdjacentElement("afterend",bar);
    applyRoleNavigation(bar);
  }
  const addMenuButton=(menu)=>{
    const activeTopbar=document.querySelector(".topbar");
    if(!activeTopbar)return;
    const right=activeTopbar.querySelector(".topright")||activeTopbar;
    const toggle=document.createElement("button");
    toggle.type="button";
    toggle.className="if-menu-toggle";
    toggle.setAttribute("aria-label","Open navigation menu");
    toggle.setAttribute("aria-controls",menu.id);
    toggle.setAttribute("aria-expanded","false");
    toggle.innerHTML='<span aria-hidden="true">☰</span><span class="if-menu-toggle-label">Menu</span>';
    right.insertBefore(toggle,right.firstChild);
    const close=()=>{
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded","false");
      toggle.setAttribute("aria-label","Open navigation menu");
    };
    const open=()=>{
      menu.classList.add("is-open");
      toggle.setAttribute("aria-expanded","true");
      toggle.setAttribute("aria-label","Close navigation menu");
    };
    toggle.addEventListener("click",()=>menu.classList.contains("is-open")?close():open());
    menu.addEventListener("click",event=>{
      if(event.target.closest("a,button")&&!event.target.closest(".if-menu-toggle"))close();
    });
    document.addEventListener("click",event=>{
      if(menu.classList.contains("is-open")&&!menu.contains(event.target)&&!toggle.contains(event.target))close();
    });
    document.addEventListener("keydown",event=>{if(event.key==="Escape")close();});
  };
  if(nav){
    nav.id="if-dashboard-navigation";
    nav.classList.add("if-left-sidebar");
    nav.querySelectorAll("button:not(.if-sidebar-toggle),a").forEach(el=>{
      const label=(el.textContent||"").trim();
      if(label){el.setAttribute("aria-label",label);el.setAttribute("title",label);}
    });
    nav.querySelector(".if-sidebar-toggle")?.remove();
  }else{
    const bar=document.querySelector(".if-workspace-nav");
    if(bar){
      bar.id="if-workspace-navigation";
      bar.classList.add("if-left-sidebar");
    }
  }
  const brand=document.querySelector(".topbar .brand");
  if(brand&&/indinext/i.test(brand.textContent))brand.textContent="INDINEXT";
})();