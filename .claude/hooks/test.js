const { execSync } = require('child_process');
try {
  console.log('\n[テスト] 実行中...');
  execSync('pnpm vitest run 2>&1', { stdio: 'inherit', shell: true });
  console.log('[テスト] 全テスト通過');
} catch {
  console.error('[テスト] 失敗あり。確認してください。');
}
