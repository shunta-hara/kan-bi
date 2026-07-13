const { execSync } = require('child_process');
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    const command = data.tool_input?.command || '';
    if (!/git\s+commit/.test(command)) return;
    console.log('\n[コミット前チェック] 実行中...');
    let failed = false;
    try { execSync('npx tsc --noEmit', { stdio: 'pipe' }); console.log('  tsc OK'); }
    catch (e) { console.error('  tsc FAIL\n' + (e.stdout||'').toString().split('\n').slice(0,10).join('\n')); failed = true; }
    try { execSync('pnpm vitest run', { stdio: 'pipe' }); console.log('  test OK'); }
    catch (e) { console.error('  test FAIL\n' + (e.stdout||'').toString().split('\n').slice(0,15).join('\n')); failed = true; }
    if (failed) { console.error('\n[コミット前チェック] 修正してからコミットしてください。'); process.exitCode = 1; }
    else { console.log('\n[コミット前チェック] 全チェック通過'); }
  } catch {}
});
