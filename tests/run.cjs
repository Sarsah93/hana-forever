const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
function run(args) { const r=spawnSync(process.execPath,args,{stdio:'inherit'}); if(r.status!==0)process.exit(r.status||1); }
run(['node_modules/typescript/bin/tsc','-p','tsconfig.test.json']);
fs.writeFileSync('.test-build/package.json', '{"type":"commonjs"}');
run(['--test','tests/physics.cjs']);
