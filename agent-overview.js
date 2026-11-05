/* INDINEXT Agent Overview — live today's hours; historical Excel metrics await importer */
(()=>{
 const $=id=>document.getElementById(id),api=window.IndiFrameAPI;
 const pad=n=>String(n).padStart(2,"0");
 const localISO=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
 const clock=v=>{if(!v)return"—";const d=new Date(v);return isNaN(d)?"—":d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true});};
 const duration=seconds=>{seconds=Math.max(0,Math.floor(seconds||0));return pad(Math.floor(seconds/3600))+"h "+pad(Math.floor(seconds%3600/60))+"m";};
 const monday=d=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-((x.getDay()+6)%7));return x;};
 async function loadLiveToday(){
  if(!api?.apiRequest||!$("overviewTodayLogin"))return;
  const now=new Date(),today=localISO(now),weekStart=localISO(monday(now));
  $("overviewTodayDate").textContent=now.toLocaleDateString("en-IN",{weekday:"short",day:"2-digit",month:"short",year:"numeric"});
  $("overviewWeekRange").textContent=weekStart+" – "+localISO(new Date(monday(now).getTime()+6*86400000));
  $("overviewMonthLabel").textContent=now.toLocaleDateString("en-IN",{month:"long",year:"numeric"});
  try{
   const [attendance,breaks]=await Promise.all([
    api.apiRequest("/api/hd/attendance/history?from="+today+"&to="+today),
    api.apiRequest("/api/hd/breaks/status")
   ]);
   const record=(attendance.records||[]).find(x=>String(x.workDate||"").slice(0,10)===today);
   if(!record){$("overviewTodayLogin").textContent="Not checked in";$("overviewTodayWork").textContent="00h 00m";$("overviewLiveStatus").textContent="No live check-in recorded for today.";return;}
   $("overviewTodayLogin").textContent=clock(record.checkInAt);
   const end=record.checkOutAt?new Date(record.checkOutAt):now;
   let gross=Math.max(0,(end-new Date(record.checkInAt))/1000);
   const history=(breaks.history||[]).filter(b=>String(b.started_at||"").slice(0,10)===today);
   let breakSeconds=history.reduce((sum,b)=>sum+(Number(b.duration_seconds)||0),0);
   if(breaks.active&&String(breaks.active.started_at||"").slice(0,10)===today){
    breakSeconds+=Math.max(0,Math.floor((now-new Date(breaks.active.started_at))/1000));
   }
   $("overviewTodayWork").textContent=duration(gross-breakSeconds);
   $("overviewLiveStatus").textContent=record.checkOutAt?"Shift completed · Breaks excluded":"Currently working · Live refresh every 30 seconds";
  }catch(e){
   $("overviewTodayLogin").textContent="Unavailable";
   $("overviewTodayWork").textContent="—";
   $("overviewLiveStatus").textContent="Live attendance unavailable: "+e.message;
  }
 }
 document.addEventListener("DOMContentLoaded",()=>{
  loadLiveToday();
  window.setInterval(loadLiveToday,30000);
 });
})();
