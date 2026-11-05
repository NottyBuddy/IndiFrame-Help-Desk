const {test,expect}=require("@playwright/test");
const API="https://indiframe-helpdesk-api.mukuls2302.workers.dev";
async function mockApi(page,role="agent",superAdmin=false){
 let acwActive=null,breakActive=null;
 await page.route(API+"/**",async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(req.method()==="OPTIONS"){await route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"Authorization,Content-Type"}});return;}
  let data={};
  if(path==="/api/me")data={user:{id:1,employeeId:"AG001",fullName:"Test Agent",role,isSuperAdmin:superAdmin}};
  else if(path==="/api/hd/breaks/status")data={active:breakActive,serverTime:new Date().toISOString()};
  else if(path==="/api/hd/acw/status")data={active:acwActive,serverTime:new Date().toISOString()};
  else if(path==="/api/hd/acw/start"&&req.method()==="POST"){acwActive={id:9,started_at:new Date().toISOString()};data={id:9,startedAt:acwActive.started_at};}
  else if(path==="/api/hd/acw/end"&&req.method()==="POST"){data={id:9,durationSeconds:125};acwActive=null;}
  else if(path==="/api/hd/admin/breaks/status")data={breaks:[{id:1,break_type:"tea",started_at:"2026-11-06T08:00:00.000Z",ended_at:"2026-11-06T08:10:00.000Z",duration_minutes:10,employee_id:"AG001",full_name:"Test Agent",elapsedSeconds:600}]};
  else if(path==="/api/admin/agents")data={agents:[{id:1,employeeId:"AG001",fullName:"Test Agent",active:1,role:"agent"}]};
  else if(path==="/api/hd/attendance/history")data={records:[{employeeId:"AG001",workDate:"2026-11-06",checkInAt:"2026-11-06T07:30:00.000Z",checkOutAt:null}]};
  else if(path==="/api/hd/admin/acw/sessions")data={sessions:[{id:9,employee_id:"AG001",full_name:"Test Agent",started_at:"2026-11-06T08:30:00.000Z",ended_at:null,duration_seconds:null,elapsedSeconds:300},{id:8,employee_id:"AG001",full_name:"Test Agent",started_at:"2026-11-05T08:30:00.000Z",ended_at:"2026-11-05T08:35:00.000Z",duration_seconds:300,elapsedSeconds:300}]};
  else data={};
  await route.fulfill({status:200,headers:{"content-type":"application/json","access-control-allow-origin":"*"},body:JSON.stringify(data)});
 });
 await page.route("https://cdn.jsdelivr.net/**",route=>route.abort());
}
test("Agent can start and end ACW separately; no history is exposed",async({page})=>{
 await mockApi(page);
 await page.goto("/breaks.html");
 await expect(page.locator("#startAcw")).toBeEnabled();
 await expect(page.getByText("Break History")).toHaveCount(0);
 await page.locator("#startAcw").click();
 await expect(page.locator("#acwStatePill")).toHaveText("IN ACW");
 await expect(page.locator("#endAcw")).toBeEnabled();
 await expect(page.locator("#startBreak")).toBeDisabled();
 await page.locator("#endAcw").click();
 await expect(page.locator("#acwStatePill")).toHaveText("NOT IN ACW");
 await expect(page.locator("#endAcw")).toBeDisabled();
});
test("Admin sees ACW history and cannot export or modify it",async({page})=>{
 await mockApi(page,"admin",false);
 await page.goto("/admin-section.html?section=breaks");
 await expect(page.locator("#breakAcwTable")).toContainText("Test Agent");
 await expect(page.locator("#breakAcwTable")).toContainText("Completed");
 await expect(page.locator("#breakLiveTable")).toContainText("In ACW");
 await expect(page.locator("#exportAcw")).toBeHidden();
 await expect(page.locator("#sectionTable .section-delete")).toHaveCount(0);
});
test("Super Admin receives ACW CSV export control",async({page})=>{
 await mockApi(page,"admin",true);
 await page.goto("/admin-section.html?section=breaks");
 await expect(page.locator("#exportAcw")).toBeVisible();
 const downloadPromise=page.waitForEvent("download");
 await page.locator("#exportAcw").click();
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toBe("Indinext_ACW_sessions.csv");
});
