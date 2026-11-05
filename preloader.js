/* First-visit session preloader for Indinext. Internal page navigation remains uninterrupted. */
(function(){
  "use strict";
  var KEY="indinext_liquid_glass_seen_v1";
  try {
    if (sessionStorage.getItem(KEY)==="1") return;
    sessionStorage.setItem(KEY,"1");
  } catch(e) {}
  var reduce=false;
  try { reduce=window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch(e) {}
  var loader=document.createElement("div");
  loader.id="if-loader";
  loader.setAttribute("role","status");
  loader.setAttribute("aria-label","Indinext loading");
  loader.innerHTML='<div class="if-loader-stage"><div class="if-loader-glass"></div><div class="if-loader-word if-loader-word-frame">FRAME</div><div class="if-loader-word if-loader-word-glass">GLASS</div><div class="if-loader-word if-loader-word-install">INSTALL</div><div class="if-loader-word if-loader-word-hardware">HARDWARE</div><div class="if-loader-word if-loader-word-fit">FIT</div><div class="if-loader-word if-loader-word-finish">FINAL FINISH</div><div class="if-loader-dot d7"></div><div class="if-loader-dot d6"></div><div class="if-loader-dot d5"></div><div class="if-loader-dot d4"></div><div class="if-loader-dot d3"></div><div class="if-loader-dot d2"></div><div class="if-loader-dot d1"></div><div class="if-loader-orb"></div><div class="if-loader-caption">INDINEXT · EXPERIENCE IN MOTION</div><div class="if-loader-progress"></div></div>';
  (document.body||document.documentElement).appendChild(loader);
  var started=Date.now(), minimum=reduce?250:1400, maxWait=4000, loaded=document.readyState==="complete";
  window.addEventListener("load",function(){loaded=true;finishWhenReady();},{once:true});
  function finishWhenReady(){
    var elapsed=Date.now()-started;
    if((loaded && elapsed>=minimum) || elapsed>=maxWait){
      loader.classList.add("if-loader-exit");
      window.setTimeout(function(){if(loader.parentNode)loader.parentNode.removeChild(loader);},750);
    } else {
      window.setTimeout(finishWhenReady,Math.min(250,Math.max(50,minimum-elapsed)));
    }
  }
  if(loaded) finishWhenReady();
  else window.setTimeout(finishWhenReady,maxWait);
})();
