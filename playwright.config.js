const {defineConfig}=require("@playwright/test");
module.exports=defineConfig({
 testDir:"./browser-tests",timeout:30000,expect:{timeout:7000},reporter:"list",
 use:{baseURL:"http://127.0.0.1:4173",browserName:"chromium",headless:true},
 webServer:{command:"node browser-test-server.js",url:"http://127.0.0.1:4173",reuseExistingServer:!process.env.CI,timeout:15000}
});
