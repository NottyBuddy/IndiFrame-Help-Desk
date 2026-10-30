const { load } = require("./harness");
const A = load();
let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : (fail++, console.log("FAIL:", name, "\n   got :", JSON.stringify(got), "\n   want:", JSON.stringify(want)));
};
const ymd = v => { const r = A.parseDateParts(v); return r.ok ? A.partsToYMD(r.parts) : null; };
const serial = (y,m,d) => (Date.UTC(y,m-1,d) - Date.UTC(1899,11,30)) / 86400000;

// ---- 1. date normalization (run under several TZ values by the shell) ----
t("ISO date", ymd("2026-09-24"), "2026-09-24");
t("ISO timestamp space", ymd("2026-09-24 10:15:30"), "2026-09-24");
t("ISO T timestamp", ymd("2026-09-24T23:59:59"), "2026-09-24");
t("ISO with Z stays on same day", ymd("2026-09-24T23:59:59Z"), "2026-09-24");
t("ISO with +05:30 stays", ymd("2026-09-24T00:00:00+05:30"), "2026-09-24");
t("DD/MM/YYYY", ymd("24/09/2026"), "2026-09-24");
t("D/M/YYYY ambiguous read as DD/MM", ymd("03/04/2026"), "2026-04-03");
t("DD-MM-YYYY", ymd("24-09-2026"), "2026-09-24");
t("DD.MM.YYYY", ymd("24.09.2026"), "2026-09-24");
t("DD/MM/YYYY with 12h PM", ymd("24/09/2026 11:30 PM"), "2026-09-24");
t("DD/MM/YYYY 24h time", ymd("24/09/2026 23:59:59"), "2026-09-24");
t("24 Sep 2026", ymd("24 Sep 2026"), "2026-09-24");
t("24-Sept-2026", ymd("24-Sept-2026"), "2026-09-24");
t("Excel serial number", ymd(serial(2026,9,24)), "2026-09-24");
t("Excel serial with time (23:59:59)", ymd(serial(2026,9,24) + 86399/86400), "2026-09-24");
t("Excel serial 00:00:00 exactly", ymd(serial(2026,9,24)), "2026-09-24");
t("Excel serial as text", ymd(String(serial(2026,9,24))), "2026-09-24");
t("Excel serial leap day 2028", ymd(serial(2028,2,29)), "2028-02-29");
t("Excel serial year end", ymd(serial(2026,12,31)), "2026-12-31");
t("MM/DD/YYYY (24th month) is rejected, not rolled over", ymd("09/24/2026"), null);
t("31/02/2026 rejected", ymd("31/02/2026"), null);
t("29/02/2026 (non-leap) rejected", ymd("29/02/2026"), null);
t("29/02/2028 (leap) accepted", ymd("29/02/2028"), "2028-02-29");
t("garbage rejected", ymd("not a date"), null);
t("empty is 'missing'", A.parseDateParts("").empty, true);
t("tiny number rejected", ymd(5), null);
t("MM/DD hint in message", /looks like MM\/DD\/YYYY/.test(A.parseDateParts("09/24/2026").reason), true);
t("toDateString invalid -> Unknown", A.toDateString("zzz"), "Unknown");

// ---- 2. range helpers with a fixed 'now' (late evening and just after midnight) ----
const lateNow = new Date(2026, 8, 24, 23, 59, 0);
const earlyNow = new Date(2026, 8, 24, 0, 1, 0);
t("today (late)", A.computeRangeDates("today","","",lateNow), {from:"2026-09-24",to:"2026-09-24"});
t("today (00:01)", A.computeRangeDates("today","","",earlyNow), {from:"2026-09-24",to:"2026-09-24"});
t("7d", A.computeRangeDates("7d","","",lateNow), {from:"2026-09-18",to:"2026-09-24"});
t("month", A.computeRangeDates("month","","",lateNow), {from:"2026-09-01",to:"2026-09-24"});
t("all", A.computeRangeDates("all"), {from:"",to:""});
t("custom", A.computeRangeDates("custom","2026-09-01","2026-09-10"), {from:"2026-09-01",to:"2026-09-10"});
t("isDateInRange edge from", A.isDateInRange("2026-09-01","2026-09-01","2026-09-10"), true);
t("isDateInRange edge to", A.isDateInRange("2026-09-10","2026-09-01","2026-09-10"), true);
t("isDateInRange outside", A.isDateInRange("2026-09-11","2026-09-01","2026-09-10"), false);
t("isDateInRange unknown", A.isDateInRange("Unknown","",""), false);

// ---- 3. header / sheet selection with existing column names ----
const H = ["Call ID","Provider Call SID","Date","Start Time","End Time","Duration","Direction","Call Status","From Number","To Number","Agent","Disposition"];
const blank = n => Array(n).fill("");
const rawSheetRows = [
  ["Solara Call Report", ...blank(11)],            // title row padded with blanks (used to score as a header)
  blank(12),
  H,
  ["C1","S1","2026-09-24","2026-09-24 10:00:00","2026-09-24 10:02:00",120,"Outbound","Completed","900","800","Asha","Interested"],
];
const dashSheet = [["Date","Total Calls","Outgoing","Incoming","Completed","Connect Rate"],["2026-09-24",5,3,2,4,"80%"]];
const pick = A.pickRawSheet({ "Call Dashboard": dashSheet, "Row Data": rawSheetRows, "Day Wise": dashSheet });
t("picked sheet", pick.name, "Row Data");
t("header row index (0-based) skips padded title row", pick.headerIndex, 2);
t("old-style blank-padded title row no longer a header", A.findHeaderRow([["Title",...blank(11)], H]), 1);
t("CSV-like rows w/o header -> -1", A.findHeaderRow([["a","b"],["c","d"]]), -1);
let threw = false; try { A.pickRawSheet({ X: dashSheet }); } catch(e){ threw = true; }
t("no raw sheet -> error", threw, true);

// ---- 4. row normalization & import stats ----
const dataRows = [
  H,
  ["C1","S1", serial(2026,9,24), "", "", 120, "Outbound", "Completed", "900","800","Asha","Interested"],       // serial date, numeric duration
  ["C2","S2","2026-09-24","","","0:01:30","outgoing","no-answer","900","801","Asha","NA"],                      // time-string duration, failed
  ["C3","S3","24/09/2026","","","45","Incoming","Answered","902","800","  Ravi  ","Query"],                     // DMY, extra spaces in agent
  ["C4","S4","09/24/2026","","","10","Outgoing","Completed","1","2","Ravi","x"],                               // MDY -> reject
  ["C5","S5","31/02/2026","","","10","Outgoing","Completed","1","2","Ravi","x"],                               // impossible -> reject
  ["C6","S6","","","","10","Outgoing","Completed","1","2","Ravi","x"],                                         // missing date -> reject
  ["Total","","","","",999,"","","","","",""],                                                                  // summary row skipped
  blank(12),                                                                                                    // blank row
  ["C7","S7","2026-09-25 08:00:00","","",0.0010416667,"Outbound","Unanswered","1","2","","x"],                  // blank agent, day-fraction duration (90s), "Unanswered"
  ["C8","S8","garbage","","","10","Outgoing","Completed","1","2","Ravi","x"],                                  // invalid -> reject
];
const res = A.workbookRowsToRecordArray(dataRows, 0, 4); // pretend sheet starts at spreadsheet row 5
const v = res.validRows;
t("valid count", v.length, 4);
t("rejected total", Object.values(res.stats.reasonCounts).reduce((a,b)=>a+b,0), 4);
t("reason counts", res.stats.reasonCounts, {"Invalid date":3,"Missing date":1});
t("summary rows skipped", res.stats.summaryRowsSkipped, 1);
t("blank rows", res.stats.blankRows, 1);
t("rejected row numbers (sheet row = index+1+offset)", res.stats.rejected.map(r=>r.row), [9,10,11,15]);
t("C1 date from serial", v[0].date, "2026-09-24");
t("C1 duration kept", v[0].durationSeconds, 120);
t("C1 fields preserved", [v[0].callId, v[0].providerCallSid, v[0].direction, v[0].status, v[0].agent, v[0].fromNumber, v[0].toNumber, v[0].disposition], ["C1","S1","Outgoing","Completed","Asha","900","800","Interested"]);
t("C2 time-string duration", v[1].durationSeconds, 90);
t("C2 'no-answer' -> Failed", v[1].status, "Failed");
t("C3 DMY date", v[2].date, "2026-09-24");
t("C3 'Answered' -> Completed", v[2].status, "Completed");
t("C3 direction Incoming", v[2].direction, "Incoming");
t("C3 agent trimmed", v[2].agent, "Ravi");
t("C7 'Unanswered' is NOT Completed", v[3].status, "Failed");
t("C7 day-fraction duration -> 90s", v[3].durationSeconds, 90);
t("C7 blank agent preserved as blank", v[3].agent, "");
t("C7 date with time", v[3].date, "2026-09-25");

// header-name collision regressions: 'Total Duration' must not become To Number, blank header ignored
const hdr2 = ["Call ID","","Date","Direction","Status","Total Duration","To Number","From Number","Agent Name"];
const r2 = A.workbookRowsToRecordArray([hdr2, ["X1","JUNK","2026-09-24","Outbound","Completed",75,"555","444","Meera"]], 0);
t("To Number not stolen by Total Duration/blank header", [r2.validRows[0].toNumber, r2.validRows[0].fromNumber, r2.validRows[0].durationSeconds, r2.validRows[0].agent], ["555","444",75,"Meera"]);

// status rules
const st = s => A.normalizeStatus(s);
t("status completed", st("completed"), "Completed");
t("status connected", st("Connected"), "Completed");
t("status answered", st("answered"), "Completed");
t("status unanswered", st("unanswered"), "Failed");
t("status not answered", st("Not Answered"), "Failed");
t("status disconnected", st("disconnected"), "Failed");
t("status not connected", st("not-connected"), "Failed");
t("status busy", st("busy"), "Failed");
t("status no-answer", st("no-answer"), "Failed");
t("status in-progress", st("in-progress"), "In Progress");
t("status unknown label kept", st("voicemail"), "Voicemail");
t("status blank", st(""), "Unknown");

// duration
t("dur int", A.parseDurationSeconds(120), 120);
t("dur h:m:s", A.parseDurationSeconds("1:02:03"), 3723);
t("dur m:s", A.parseDurationSeconds("2:05"), 125);
t("dur 'Not a number'", A.parseDurationSeconds("abc"), 0);

// ---- 5. reports ----
const mk = (date, agent, direction, status, dur) => ({callId:"", providerCallSid:"", date, agent, direction, status, durationSeconds:dur});
const calls = [
  mk("2026-09-24","Asha","Outgoing","Completed",100),
  mk("2026-09-24","Asha","Outgoing","Failed",0),
  mk("2026-09-24","asha ","Outgoing","Completed",50),     // same agent, different case/spacing
  mk("2026-09-24","Ravi","Incoming","Completed",30),
  mk("2026-09-25","Ravi","Outgoing","In Progress",5),
  mk("2026-09-25","","Outgoing","Unknown",0),               // blank agent
  mk("",           "Ravi","Incoming","Completed",20),       // missing date
];
const dw = A.buildDayWiseRows(calls);
t("day-wise dates (unknown last)", dw.map(r=>r.date), ["2026-09-24","2026-09-25","Unknown"]);
t("day 24 aggregates", [dw[0].total,dw[0].outgoing,dw[0].incoming,dw[0].completed,dw[0].connectedOutgoing,dw[0].totalDuration,dw[0].connectedDuration], [4,3,1,3,2,180,180]);
t("day 25 aggregates", [dw[1].total,dw[1].outgoing,dw[1].incoming,dw[1].completed,dw[1].connectedOutgoing], [2,2,0,0,0]);
t("unknown-date group", [dw[2].total, dw[2].incoming, dw[2].completed], [1,1,1]);
const ag = A.buildAgentReportRows(calls);
t("agents sorted by total desc", ag.map(r=>[r.agent,r.total]), [["Asha",3],["Ravi",3],["(No agent)",1]]);
const asha = ag[0], ravi = ag[1], none = ag[2];
t("Asha", [asha.total,asha.outgoing,asha.incoming,asha.connectedOutgoing,asha.completed,asha.connectedDuration], [3,3,0,2,2,150]);
t("Ravi", [ravi.total,ravi.outgoing,ravi.incoming,ravi.connectedOutgoing,ravi.completed,ravi.connectedDuration], [3,1,2,0,2,50]);
t("No agent kept", [none.total,none.outgoing,none.completed], [1,1,0]);
t("sum of agent totals equals records", ag.reduce((s,r)=>s+r.total,0), calls.length);
t("ratio normal", A.ratioLabel(2,3), "66.7%");
t("ratio zero denominator", A.ratioLabel(0,0), "—");
t("ratio genuine zero", A.ratioLabel(0,5), "0.0%");
t("avg duration none", A.avgDurationLabel(0,0), "—");
t("avg duration", A.avgDurationLabel(150,2), "1m 15s");

// ---- 6. rendering through the real DOM-bound functions ----
const html = id => A.els[id] ? A.els[id].innerHTML : undefined;
A.run(`currentUser={role:"admin",fullName:"Admin",employeeId:"A1"}; currentRange="all"; rawCalls=${JSON.stringify(calls)};`);
A.run("renderDashboard()");
t("KPI total shows count", A.els.mTotalCalls.textContent, 7);
t("KPI zero cases show 0 not dash (incoming)", A.els.mIncomingCalls.textContent, 2);
t("day wise rendered rows", (html("dayWiseTable").match(/<tr>/g)||[]).length, 4); // 1 header + 3 rows
t("agent table rendered rows", (html("agentReportTable").match(/<tr>/g)||[]).length, 4);

// zero rows
A.run(`rawCalls=[]; renderDashboard()`);
t("zero rows: KPI total 0", A.els.mTotalCalls.textContent, 0);
t("zero rows: message, no fabricated rows", /No call data has been imported yet/.test(html("dayWiseTable")) && !/<tr>/.test(html("dayWiseTable")), true);
t("zero rows: avg connected dash", A.els.mAvgConnectedDuration.textContent, "—");

// one day of data
A.run(`rawCalls=${JSON.stringify(calls.filter(c=>c.date==="2026-09-25"))}; currentRange="all"; renderDashboard()`);
t("one day: 1 data row", (html("dayWiseTable").match(/<tr>/g)||[]).length, 2);

// date filter alone / agent filter alone / both
A.run(`rawCalls=${JSON.stringify(calls)}; currentRange="all";`);
A.els.dateFilter.value = "2026-09-24"; A.els.agentFilter.value = "";
t("date filter only", A.run("getFilteredCalls().length"), 4);
A.els.dateFilter.value = ""; A.els.agentFilter.value = "ravi";
t("agent filter only (case-insens.)", A.run("getFilteredCalls().length"), 3);
A.els.dateFilter.value = "2026-09-24"; A.els.agentFilter.value = "ravi";
t("date + agent together", A.run("getFilteredCalls().length"), 1);
A.els.agentFilter.value = "(no agent)"; A.els.dateFilter.value = "";
t("blank-agent records findable", A.run("getFilteredCalls().length"), 1);
A.els.agentFilter.value = "nobody"; A.run("renderDashboard()");
t("no match: empty message with filter text, no rows", /agent: &quot;nobody&quot;/.test(html("dayWiseTable")) && !/<tr>/.test(html("dayWiseTable")), true);

// range change refreshes reports: records at 2026-09-24 only appear when range includes them
A.els.agentFilter.value = ""; A.els.dateFilter.value = "";
A.run(`currentRange="custom"; currentCustomRange={from:"2026-09-25",to:"2026-09-25"}; renderDashboard()`);
t("custom range 25th -> 2 calls in KPI", A.els.mTotalCalls.textContent, 2);
t("custom range 25th -> day-wise has 1 data row", (html("dayWiseTable").match(/<tr>/g)||[]).length, 2);
t("custom range excludes missing-date record", A.run("getFilteredCalls().some(c=>!c.date)"), false);

// HTML injection
A.run(`currentRange="all"; rawCalls=${JSON.stringify([mk("2026-09-24","<img src=x onerror=alert(1)>","Outgoing","Completed",5)])}; renderDashboard()`);
t("agent name escaped in agent table", /&lt;img src=x onerror=alert\(1\)&gt;/.test(html("agentReportTable")) && !/<img/.test(html("agentReportTable")), true);
t("agent name escaped in chart", !/<img/.test(html("agentChart")), true);
A.run(`importMeta.summary={fileName:"<script>x</script>.xlsx",sheetName:"S",headerRowNumber:1,rowsProcessed:1,validRows:0,duplicatesMerged:0,rejectedRows:1,reasons:{"<b>r</b>":1},samples:[{row:2,reason:"<i>",detail:"<u>"}],summaryRowsSkipped:0}; renderFreshness()`);
t("import summary escaped", !/<script>|<b>|<i>|<u>/.test(html("importWarningsBox")), true);

// non-admin does not get the all-agent table
A.run(`currentUser={role:"agent",fullName:"Emp",employeeId:"E1"}; renderDashboard()`);
t("non-admin: agent table not rendered", html("agentReportTable"), "");

// import summary object
const summ = A.buildImportSummary({fileName:"f.xlsx", sheetName:"Row Data", headerRowNumber:3, stats:res.stats, validBeforeDedupe:4, validAfterDedupe:4});
t("summary numbers", [summ.rowsProcessed, summ.validRows, summ.rejectedRows, summ.duplicatesMerged], [8,4,4,0]);

console.log(`TZ=${process.env.TZ||"(default)"}  passed ${pass}, failed ${fail}`);
process.exitCode = fail ? 1 : 0;
