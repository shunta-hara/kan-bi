const { execSync } = require('child_process');
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    const filePath = data.tool_input?.file_path || '';
    if (!/\.(ts|tsx|js|jsx|mts|mjs)$/.test(filePath)) return;
    try { execSync(`npx prettier --write "${filePath}"`, { stdio: 'pipe' }); } catch {}
    try { execSync(`npx eslint --fix "${filePath}"`, { stdio: 'pipe' }); } catch {}
  } catch {}
});
