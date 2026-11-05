/* First-visit session preloader. Internal page navigation remains uninterrupted. */
(function(){
  "use strict";
  var KEY="indiframe_preloader_seen_v1";
  try {
    if (sessionStorage.getItem(KEY)==="1") return;
    sessionStorage.setItem(KEY,"1");
  } catch(e) {}
  var reduce=false;
  try { reduce=window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch(e) {}
  var loader=document.createElement("div");
  loader.id="if-loader";
  loader.setAttribute("role","status");
  loader.setAttribute("aria-label","IndiFrame loading");
  loader.innerHTML='<div class="if-loader-stage"><div class="if-loader-word if-loader-word-basic">BASIC</div><div class="if-loader-word if-loader-word-advanced">ADVANCED</div><div class="if-loader-word if-loader-word-motion">MOTION</div><div class="if-loader-orb if-purple"></div><div class="if-loader-caption">INDIFRAME · EXPERIENCE IN MOTION</div><div class="if-loader-progress"></div></div>';
  (document.body||document.documentElement).appendChild(loader);
  var started=Date.now(), minimum=reduce?450:11000, maxWait=15000, loaded=document.readyState==="complete";
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