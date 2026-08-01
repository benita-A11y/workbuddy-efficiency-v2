# 部署指南 · 效率管理（任务·复盘·记账 PWA）

> **先说结论**：本应用是**纯静态前端**（HTML/CSS/JS），数据全部存在手机/浏览器本地（localStorage），**没有任何服务器后端**，也**不需要 Node.js 常驻运行**。所谓"关掉电脑手机就打不开"，只是因为你之前是用电脑局域网 IP 在浏览器里临时访问——只要把文件放到一个公网静态托管，或把应用**安装到手机桌面（PWA）**，就彻底与电脑无关了。

---

## 一、最推荐：部署到公网静态托管（手机随时访问，电脑关了也不影响）

任选其一，全程免费，几分钟搞定。

### 方案 A：Vercel（最省心，推荐）
1. 把整个项目文件夹推送到 GitHub（仓库如 `workbuddy`）。
   需要包含：`index.html`、`css/`、`js/`、`manifest.json`、`sw.js`、`icons/`。
2. 打开 https://vercel.com ，用 GitHub 登录。
3. **Add New → Project** → 选择你的 `workbuddy` 仓库。
4. Framework Preset 选 **Other**（或空），Build Command / Output 都不用填（纯静态）。
5. 点 **Deploy**，约 1 分钟完成。
6. 得到形如 `https://workbuddy-xxx.vercel.app` 的公网 HTTPS 链接。

### 方案 B：Netlify
1. 打开 https://app.netlify.com
2. 直接把项目文件夹**拖拽**到 "Deploy manually" 区域；或 **Add new site → Import from Git**。
3. 部署完成即得到公网链接。

### 方案 C：GitHub Pages（免费、长久）
1. 仓库 Settings → Pages → Source 选 **main / root**。
2. 等待约 1 分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`。

> 注意：GitHub Pages 与 Vercel/Netlify 都支持 Service Worker 离线缓存，直接部署即可。

---

## 二、终极方案：安装成手机 App（PWA，完全离线、不依赖任何服务器）

无论你用上面的哪种公网链接，**第一次在手机浏览器打开后，把它"添加到主屏幕"**，之后就从桌面图标启动——**此时即便断网、关电脑，也照常使用**，因为代码和数据都已存在手机本地。

### iPhone / iPad（Safari）
1. 用 Safari 打开上面的公网链接（或电脑开着时用局域网 IP 打开也行）。
2. 点底部**分享**按钮（方框+上箭头）。
3. 下滑找到 **"添加到主屏幕"** → 点右上角**添加**。
4. 桌面出现「效率管理」图标，点开即用。

### Android（Chrome / Edge）
1. 用 Chrome 打开链接。
2. 点右上角 **⋮** → **"安装应用" / "添加到主屏幕"**。
3. 点**安装**，桌面出现图标。

> 应用内也会在首次访问时弹出「📲 添加到主屏幕」引导浮条，按提示点安装即可。

---

## 三、验证离线是否真的成功
1. 联网状态打开一次，让 Service Worker 把资源缓存下来。
2. 手机开启**飞行模式**（关掉 WiFi 和移动数据）。
3. 关闭应用再点桌面图标重新打开 → ✅ 正常打开、功能完整。
4. 新增任务、勾选、记账、计时 → ✅ 全部正常，数据保存在本地。

---

## 四、本地临时预览（开发用，非部署）
电脑上预览可以用任意静态服务器（任选）：
```bash
# 方式 1：Python
python -m http.server 8080
# 方式 2：Node
npx serve .
```
浏览器访问 `http://localhost:8080`。**这仅供电脑上开发调试，手机不要靠这个长期访问。**

---

## 五、常见问题
- **Q：必须有服务器才能用吗？** 不需要。安装成 PWA 后纯本地运行。
- **Q：数据存在哪？** 存在你设备浏览器的本地存储，不上传任何服务器，隐私安全。
- **Q：换手机/清缓存数据会丢吗？** 会。重要数据请用「我的 → 导出数据」备份 JSON，新设备导入即可。
- **Q：更新了代码手机没变？** Service Worker 已升级会**自动热更新**；若仍看到旧版，在手机浏览器「站点设置 → 清理存储（仅清 Service Worker / 缓存，别点整页清除浏览数据）」后重开。
- **Q：需要打包 APK 吗？** 不需要，PWA 体验等同原生 App 且 100% 离线。若坚持要原生安装包，可再用 PWA2APK 类工具转换，但非必需。

---

## 六、文件清单（部署时整包上传）
```
index.html
manifest.json
sw.js
css/style.css
js/storage.js
js/app.js
icons/icon-192.png
icons/icon-512.png
icons/apple-touch-icon.png
guide.html
```
