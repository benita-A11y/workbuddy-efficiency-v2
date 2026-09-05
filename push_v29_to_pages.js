// 推送 deploy-v29 (v29 农场风之外的正式功能版: 灵感卡片点击跳独立详情页) 到 GitHub Pages 仓库
// 用法: node push_v29_to_pages.js <GitHub_PAT>
// 说明: 沙箱 git push 被墙, 改用 GitHub Git Data API 全量上传 deploy-v29 内容。
//       token 仅通过命令行参数传入, 不写文件、不写 git config。
const https = require('https');
const fs = require('fs');
const path = require('path');

const OWNER = 'benita-A11y';
const REPO = 'workbuddy-efficiency-v2';
const ROOT = path.join(__dirname, 'deploy-v29');
const TOKEN = process.argv[2];
if (!TOKEN) { console.error('用法: node push_v29_to_pages.js <GitHub_PAT>'); process.exit(1); }

const SKIP = ['.git', '.workbuddy', 'node_modules'];

function walk(dir, rel, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const r = rel ? rel + '/' + name : name;
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (SKIP.includes(name)) continue;
      walk(full, r, out);
    } else {
      if (r.endsWith('.bak')) continue;
      out.push({ path: r, full });
    }
  }
}

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL('https://api.github.com' + urlPath);
    const opt = {
      method, hostname: u.hostname, path: u.pathname + (u.hash || ''),
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'User-Agent': 'workbuddy-deploy',
        'Accept': 'application/vnd.github+json',
      }
    };
    if (data) {
      opt.headers['Content-Type'] = 'application/json';
      opt.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const r = https.request(opt, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        const status = res.statusCode;
        let json = null;
        try { json = buf ? JSON.parse(buf) : null; } catch (e) {}
        if (status >= 200 && status < 300) return resolve(json);
        const msg = (json && (json.message || (json.errors && json.errors[0] && json.errors[0].message))) || ('HTTP ' + status);
        reject(new Error(msg + ' @ ' + method + ' ' + urlPath));
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const files = [];
  walk(ROOT, '', files);
  console.log('待上传文件数:', files.length);

  // 1. 逐个创建 blob (base64)
  const entries = [];
  let i = 0;
  for (const f of files) {
    i++;
    const buf = fs.readFileSync(f.full);
    const content = buf.toString('base64');
    const res = await req('POST', `/repos/${OWNER}/${REPO}/git/blobs`, { content, encoding: 'base64' });
    entries.push({ path: f.path, mode: '100644', type: 'blob', sha: res.sha });
    if (i % 5 === 0 || i === files.length) console.log(`blob ${i}/${files.length}: ${f.path}`);
  }
  console.log('全部 blob 完成, 共', entries.length);

  // 2. 取当前 main SHA 作为 parent
  let parentSha = null;
  try {
    const ref = await req('GET', `/repos/${OWNER}/${REPO}/git/refs/heads/main`);
    parentSha = ref.object.sha;
    console.log('当前 main SHA:', parentSha.slice(0, 8));
  } catch (e) {
    console.log('无 main ref(空仓库?), 将创建初始提交:', e.message);
  }

  // 3. 创建 tree (全量)
  const tree = await req('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: entries });
  console.log('tree SHA:', tree.sha.slice(0, 8));

  // 4. 创建 commit
  const commit = await req('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: 'deploy v52: 安全与离线审计修复——quotes.js 改纯本地(移除 quotable.io 第三方请求,隐私+离线纯净+可靠); SW 补全独立页预缓存(finance/inspiration详情编辑页)确保首次离线可用; 首页阅读卡实时联动 Store.Reading 今日分钟+在读书名; 仍 SWR + CACHE_NAME 自增生效',
    tree: tree.sha,
    parents: parentSha ? [parentSha] : []
  });
  console.log('commit SHA:', commit.sha.slice(0, 8));

  // 5. 更新或创建 ref (force 允许覆盖历史)
  if (parentSha) {
    await req('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, { sha: commit.sha, force: true });
    console.log('已强制更新 main ->', commit.sha.slice(0, 8));
  } else {
    await req('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: 'refs/heads/main', sha: commit.sha });
    console.log('已创建 main ->', commit.sha.slice(0, 8));
  }

  console.log('\n部署完成。GitHub Pages 通常几秒~1分钟内重建。');
  console.log('正式网址: https://benita-a11y.github.io/workbuddy-efficiency-v2/');
  console.log('灵感详情页验证: 进入灵感 tab -> 点任意卡片 -> 跳独立详情页');
})().catch((e) => { console.error('推送失败:', e.message); process.exit(1); });
