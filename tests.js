const { load } = require("./harness");
const A = load();
let pass=0, fail=0;
function test(name, actual, expected) {
  const ok=JSON.stringify(actual)===JSON.stringify(expected);
  if(ok) pass++; else { fail++; console.error("FAIL:",name,"\n got:",actual,"\n want:",expected); }
}
const rows=[
  ["Report Date","Employee Name","Disposition","Req Filed","Call ID"],
  ["24/09/2026","Asha","Interested","Yes","C-001"],
  ["25-09-2026","Ravi","Callback","No","C-002"],
  ["2026-09-26T10:30:00","Meera","Not Interested","No","C-003"]
];
const parsed=A.run("parseCallSheet("+JSON.stringify(rows)+")");
test("parses all data rows",parsed.length,3);
test("normalizes DD/MM/YYYY date",parsed[0].__call_performance_date,"2026-09-24");
test("normalizes DD-MM-YYYY date",parsed[1].__call_performance_date,"2026-09-25");
test("keeps ISO date prefix",parsed[2].__call_performance_date,"2026-09-26");
test("extracts agent names",parsed.map(r=>r.__call_performance_agent),["Asha","Ravi","Meera"]);
test("preserves source columns",parsed[0]["Call ID"],"C-001");
test("excludes Req Filed source field",Object.keys(parsed[0]).includes("Req Filed"),false);
test("does not mutate source rows",rows[1][3],"Yes");
console.log("Call Performance importer tests: "+pass+" passed, "+fail+" failed");
process.exitCode=fail?1:0;
