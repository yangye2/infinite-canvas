# 无限画布合并记录（前端升级 v0.16.0 + 保留 Go 后端管理）

> **用途**：本文档记录本次「老版本（带 Go 后端）升级到上游最新前端」的完整思路、修改清单和关键坑点。
> **当下游（basketikun/infinite-canvas）发布新版本需要再次合并时，按本文档「再次合并操作手册」执行。**

---

## 1. 版本与来源信息

| 项目 | 说明 |
|---|---|
| 本仓库 | `yangye2/infinite-canvas`（fork 自 basketikun/infinite-canvas，保留 Go 后端） |
| 合并前基线 | 前端基于上游 v0.3.0（约 2026-06），`VERSION=v0.3.0`，历史提交 `a23e1ee` |
| 上游新版本 | `basketikun/infinite-canvas` **v0.16.0**（本地目录 `../infinite-canvas-org`，上游提交 `ed013e8`，2026-08-27，纯 Vite 前端、无后端） |
| 合并日期 | 2026-09-01 |
| 关键提交 | `b099e85` 前端升级+后端管理接入；`8e6fd56` 修复 BOM/CRLF；agnes 修复提交见 git log |
| Agnes 接口文档 | 本地 `../agnes-ai/`（图像.md / 视频.md / 文本.md）；在线：https://www.agnes-ai.com/zh-Hans/docs/overview 与 https://wiki.agnes-ai.com/llms.txt |
| 上游版本获取 | `git clone https://github.com/basketikun/infinite-canvas infinite-canvas-org && cd infinite-canvas-org && git log -1` |

**上游架构特点（v0.16.0）**：纯 Vite SPA（`web/`），无 Next.js、无后端；多渠道（`ModelChannel[]`，模型值为 `channelId::modelName`）；apiFormat 仅 openai/gemini；有 i18n（zh-CN/en-US）、Agent/Skill、模型调用脚本、提示词来源。

**本仓库架构**：根目录 Go 后端（gin：auth/admin/AI 代理/算力点）+ `web/` Vite 前端；nginx 托管静态页并把 `/api` 反代到容器内 8080 的 Go 服务。

---

## 2. 合并策略（思路）

1. **以新前端为基座**：整个 `web/` 用上游 v0.16.0 覆盖（保留上游全部新特性）。
2. **后端零改动**：根目录 Go 代码（`handler/ router/ service/ middleware/ model/ repository/ config/ main.go`）原样保留，合并时一行不改。
3. **把"后端管理"重新接入新前端**：登录/注册、admin 五个管理页、用户状态（头像菜单/算力点）、remote 渠道模式（走 `/api/v1/*` 代理+计费）、agnes 本地直连。
4. **双渠道模式共存**：
   - `remote`（后台渠道）：AI 请求 → `/api/v1/*`（带用户 JWT）→ Go 按模型名选渠道转发并扣算力点；模型列表来自 `GET /api/settings` 的公开配置。
   - `local`（本地渠道）：浏览器直连用户自己的 baseUrl+Key（上游原有能力），支持 openai/gemini/**agnes**。
   - 管理员可通过后台「是否允许用户自定义渠道」强制 remote。

---

## 3. 修改清单（合并时需要在"新前端"上重做的所有事）

### 3.1 整体替换
- `rm -rf web && cp -r ../infinite-canvas-org/web web`
- `VERSION` → 对齐上游（本次 `v0.16.0`）；`CHANGELOG.md` 顶部 Unreleased 写清本次合并内容。

### 3.2 从老前端恢复的后端管理文件（来源：`git show b099e85^:web/...` 或老仓库历史 `a23e1ee`）
- `web/src/pages/admin/`（layout.tsx、index.tsx、users.tsx、credit-logs.tsx、prompts.tsx、assets.tsx、settings.tsx、use-admin-*.ts）
- `web/src/pages/login/index.tsx`
- `web/src/services/api/auth.ts`、`web/src/services/api/admin.ts`
- `web/src/stores/use-user-store.ts`（覆盖上游的 LocalUser 简化版；上游无其他引用，安全）
- `web/src/constant/credits.tsx`
- `web/src/services/api/request.ts`：**合并**而非覆盖——保留上游的 `compactApiParams/serializeApiParams`，加回 axios 版 `apiGet/apiPost/apiDelete`（admin/auth 依赖）

### 3.3 修改的上游文件（重复合并时需对照上游新版逐个重做）
| 文件 | 改动 |
|---|---|
| `web/src/lib/app-theme.ts` | 合并加入 `adminLayoutStyle` 导出（admin layout 依赖） |
| `web/src/components/layout/user-status-actions.tsx` | 合并：保留上游 i18n/语言切换/插件按钮 + 加回登录按钮、用户头像菜单（管理后台入口/退出）、画布算力点显示 |
| `web/src/components/layout/client-root-init.tsx` | 加 `loadPublicSettings()` + `hydrateUser()`；baseUrl/apiKey URL 参数导入前检查 `allowCustomChannel`。**注意：此组件在 RouterProvider 外层，不能用 useLocation**（用组件内标志位去重即可） |
| `web/src/router.tsx` | 加 `/login` 与 `/admin`（AdminLayout + 5 个子页）路由 |
| `web/src/stores/use-config-store.ts` | ① `ApiCallFormat` 加 `"agnes"`；`AGNES_BASE_URL=https://apihub.agnes-ai.com`；`normalizeApiFormat/defaultBaseUrlForApiFormat` 支持 agnes。② 加 `publicSettings`/`isPublicSettingsLoading`/`loadPublicSettings()`（GET `/api/settings`）。③ `merge` 不再强制 `channelMode:"local"`（尊重持久化值）。④ `isAiConfigReady`：remote 只要求有模型名。⑤ **`useEffectiveConfig()` 实现 remote 伪渠道**：`resolveEffectiveConfig` 把后端 `availableModels` 映射为 id=`remote` 的合成 `ModelChannel`（`remote::模型名`），使上游所有"按渠道取模型/能力"的代码零改动生效；`allowCustomChannel=false` 时强制 remote；默认模型从 `defaultImageModel/defaultVideoModel/defaultTextModel` 映射 |
| `web/src/services/api/image.ts` | ① `aiApiUrl`/`aiHeaders` 支持 remote（`/api/v1${path}` + Bearer 用户 token）；`refreshRemoteUser`（remote 请求后刷新算力点）；`requestModelName`（remote 下去掉 `channelId::` 前缀）。② agnes 生图 `isAgnesImageConfig`/`requestAgnesGeneration`（见 §4.1）。③ **remote 文本走 `/chat/completions` SSE**：后端没有 `/responses` 路由，`requestImageQuestion` 在 remote 分支用 `requestRemoteChatCompletion`（axios onDownloadProgress 解析 `data:` 块）；local 保留上游 `/responses`。④ `requestGeneration/requestEdit` agnes 分支 + `refreshRemoteUser` |
| `web/src/services/api/video.ts` | ① remote 的 `aiApiUrl/aiHeaders`；`remoteModelParam`（remote 轮询 GET 需 `?model=纯模型名`，后端 `proxyAIGetRequest` 靠它选渠道）。② agnes 视频任务 `createAgnesTask/pollAgnesTask`（见 §4.2）。③ `assertVideoConfig` remote 跳过 baseUrl/key 校验。④ provider 加 `"agnes"` |
| `web/src/services/api/audio.ts` | remote 的 `aiApiUrl/aiHeaders`；`assertAudioConfig` remote 跳过；remote 时 payload 的 model 用 `modelOptionName`；成功后 `hydrateUser` |
| `web/src/components/layout/app-config-modal.tsx` | 渠道 tab 顶部加「渠道模式」切换（后台渠道/本地渠道 Segmented，仅当 `publicSettings.modelChannel` 存在且 allowCustomChannel 时显示；remote 下显示后端模型 chips、隐藏本地渠道编辑）；`finishConfig` 的 ready 判断兼容 remote |
| `web/src/components/layout/channel-editor-drawer.tsx` | apiFormat 选项加 `Agnes` |
| `web/src/i18n/locales/zh-CN.ts`、`en-US.ts` | 新增键（见 §5） |
| `web/vite.config.ts` | `server.proxy`: `/api` → `process.env.API_BASE_URL \|\| http://127.0.0.1:8080` |

### 3.4 部署配置
| 文件 | 改动 |
|---|---|
| `Dockerfile` | 三阶段：bun 构建 `web/dist` → golang:1.25-alpine 编译 `/server` → nginx:1.27-alpine 运行（`COPY nginx.conf`、`COPY web/docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh`）；`CMD ["sh","-c","PORT=8080 /app/server & exec nginx -g 'daemon off;'"]` |
| `nginx.conf` | 静态托管 + `/api/` → `127.0.0.1:8080`（300s 超时）+ `/config.js` no-store + SPA fallback。**必须无 BOM、LF**（见 §6 坑1） |
| `.gitattributes` | `*.sh`、`*.conf`、`Dockerfile` 强制 `text eol=lf`（防 Windows CRLF 污染进镜像） |
| `.dockerignore` | 排除 `.git .agents data web/node_modules web/dist .env*` |
| `.gitignore` | 加 `dist/`、`git-org/` |
| `.env.example` | 删除 `NEXT_PUBLIC_DOC_URL`；保留 ADMIN_USERNAME/ADMIN_PASSWORD/JWT_SECRET/JWT_EXPIRE_HOURS/PORT/PUBLIC_BASE_URL/API_BASE_URL/STORAGE_DRIVER/DATABASE_DSN |
| `docker-compose.yml` / `docker-compose.local.yml` | `env_file: .env`、`./data:/app/data`、端口 3000 |
| GitHub Actions | `.github/workflows/docker-image.yml` 无需改动（构建根目录 Dockerfile，push main/master 触发） |

---

## 4. Agnes 接口对接要点（依据 ../agnes-ai/ 官方文档，⚠️ 老代码有错，以下以文档为准）

### 4.1 图像（`agnes-image-2.0-flash`，POST `{base}/v1/images/generations`）
- **图生图**：参考图放 **`extra_body.image`**（URL 或 Data URI 数组）；`response_format` 也必须放 `extra_body` 内（顶层会被拒）。
- **文生图**：顶层 `return_base64: true`，不传 `image`；返回 `data[0].b64_json`。
- `size` 必填（如 `1024x768`）。响应取 `data[].url` 或 `data[].b64_json`（前端 `parseImagePayload` 已兼容）。
- 前端触发条件 `isAgnesImageConfig`：`local && apiFormat==="agnes"` 或模型名含 `agnes-image`。
- remote 模式下后端不改 body、路径不变，`buildAgnesChannelURL` 会给 baseUrl 自动补 `/v1`。

### 4.2 视频（`agnes-video-v2.0`，异步任务）
- **创建**：`POST {base}/v1/videos`，JSON：`{ model, prompt, width, height, num_frames, frame_rate, image? }`
  - 单参考图 → 顶层 `image`；**多参考图 → `extra_body: { image: [...], mode: "keyframes" }`**（关键帧动画）
  - `num_frames ≤ 441` 且满足 **8n+1**（前端 `normalizeAgnesNumFrames`：`min(441, 秒*24+1)` 后向下取 8n+1）；`frame_rate` 24
  - width/height 会被服务端映射到 480p/720p/1080p 档位
- **轮询（推荐）**：`GET {base}/agnesapi?video_id=<VIDEO_ID>`（不带 /v1！）；也支持 `GET /v1/videos/<TASK_ID>` 和 `&model_name=` 参数
  - local 直连：`agnesRootApiUrl(baseUrl)/agnesapi?video_id=...`（去掉 baseUrl 的 /v1 后缀）
  - remote 代理：`GET /api/v1/videos/{id}?model=...`，后端 `resolveAgnesVideoPath` 自动转成 `/agnesapi?video_id=..&model_name=..`
- **结果 URL 在 `metadata.url`**（`status==="completed"` 时）。⚠️ 老代码错误地从 `remixed_from_video_id` 取 URL——那是无关字段，已修复（保留其作为兜底）。
- 状态：`queued / in_progress / completed / failed`（兼容 `succeeded`）。
- 任务 ID 优先取响应里的 `video_id`，兜底 `task_id`/`id`。
- 后端渠道选择条件 `isAgnesVideo`：模型名含 `agnes-video`，或 `channel.Protocol==="agnes"` 且模型名含 `video`。

### 4.3 remote 模式下前后端分工
- **前端**负责构造各协议的请求体（agnes 的 JSON 格式、OpenAI 的 multipart/gemini 的原生格式）。
- **后端**只做：按模型名选渠道（加权）、路径改写（agnes 视频、seedance）、算力点扣减/退款、透传响应。
- 后端没有 `/responses` 路由 → remote 文本必须走 `/chat/completions`（SSE 流式）。

---

## 5. i18n 新增键（重复合并时补到两个 locale 文件）

- `topNav`：`login` `logout` `adminPanel` `accountMenu` `creditBalance`
- `config`：`customChannelDisabled`；`config.channels`：`remoteName` `modeLabel` `modeRemote` `modeRemoteDescription` `modeLocal` `modeLocalDescription` `modeRemoteUnavailable`
- `apiErrors`：`agnesMaskUnsupported` `referenceImageUnavailable`（其余 agnes 错误复用现有 `noVideoTaskId` `videoTaskCreateFailed` `videoTaskQueryFailed` `noPlayableVideo` `videoGenerationFailed` `referenceImageReadFailed` `noVideoTask`）

---

## 6. 踩坑记录（⚠️ 再次合并必读）

1. **BOM/CRLF（本次最大坑）**：Windows 上创建的 `nginx.conf` 带 UTF-8 BOM（`EF BB BF`）→ nginx 报 `unknown directive "server"`；`web/docker-entrypoint.sh`、`docker/start.sh` CRLF → 容器内 shebang `/bin/sh\r` 失效。已用 `.gitattributes` 强制 LF；**新增任何进入镜像的 shell/conf 文件都要 `od -c` 检查无 BOM 无 `\r`**。
2. **ClientRootInit 在 RouterProvider 外层**：不能 `useLocation()`，会直接崩溃。
3. **上游删除了 remote 渠道模式**：`use-config-store` 的 `merge` 强制 `channelMode:"local"`、`useEffectiveConfig` 强制 local——合并时要按 §3.3 恢复 remote 伪渠道方案，否则算力点/后台渠道全部失效。
4. **remote 文本不能走 `/responses`**：Go 后端只有 `/chat/completions`，必须分支处理。
5. **remote 轮询视频必须带 `?model=` 参数**：后端 `proxyAIGetRequest` 靠它选渠道，缺了会默认 `grok-imagine-video`。
6. **agnes 结果 URL 在 `metadata.url`**，不要用老代码的 `remixed_from_video_id`。
7. **多参考图视频走 `extra_body.mode:"keyframes"`**，不要把数组塞顶层 `image`。
8. **旧 `latest` 镜像缓存**：Actions 构建完成前 pull 到的是旧镜像，报错会和本次改动无关；部署前确认镜像 Created 时间。
9. **admin 页 antd v6 兼容**：老 admin 页面本来就是 antd v6 写法（`destroyOnHidden` 等），直接复制即可；但它们依赖 `@/lib/app-theme` 的 `adminLayoutStyle`（上游没有，要补）。
10. **本地开发**：`web/` 里 `bun run dev`（:3000，/api 代理到 :8080）+ `go run .`；后端首个管理员账号由 `ADMIN_USERNAME/ADMIN_PASSWORD` 自动创建。

---

## 7. 再次合并操作手册（上游发布新版本时）

```bash
# 0) 准备：更新上游副本
cd ../infinite-canvas-org && git pull origin main && git log -1   # 记下上游 commit
cd ../infinite-canvas

# 1) 备份本仓库当前 web（含我们的后端接入改动，作为"恢复来源"）
git add -A && git commit -m "chore: snapshot before re-merge"   # 确保干净
git tag pre-merge-$(date +%Y%m%d)

# 2) 整体替换前端
rm -rf web && cp -r ../infinite-canvas-org/web web
# 保留本地 web/docker-entrypoint.sh（上游同名文件如有差异，以我们的 LF 版为准）

# 3) 按 §3.2 恢复后端管理文件（从上一次 tag 或本文档 §3.2 清单）
git checkout pre-merge-xxxx -- web/src/pages/admin web/src/pages/login \
  web/src/services/api/auth.ts web/src/services/api/admin.ts \
  web/src/stores/use-user-store.ts web/src/constant/credits.tsx

# 4) 按 §3.3 逐个重做"修改的上游文件"：
#    先 diff 上游新文件与我们的旧版本，把我们的改动重新套用
#    （重点：use-config-store / image.ts / video.ts / audio.ts / request.ts /
#     app-config-modal / user-status-actions / client-root-init / router /
#     channel-editor-drawer / app-theme / i18n locales / vite.config.ts）

# 5) VERSION / CHANGELOG 对齐；i18n 新键按 §5 补齐

# 6) 验证
cd web && bun install && ./node_modules/.bin/tsc --noEmit && bun run build && cd ..
go build ./... && go vet ./...
# 冒烟：go run . 后 curl /api/health、/api/settings、/api/admin/login

# 7) 提交推送（push main 触发镜像构建），部署后验证 §8 清单
```

**重复合并时冲突高发文件**（上游也在改，需人工对照）：`image.ts`、`video.ts`、`audio.ts`、`use-config-store.ts`、`app-config-modal.tsx`、`i18n/locales/*`。我们的改动都是**追加式**（remote 分支 + agnes 分支），尽量用"在函数内加 if 分支"而不是改上游原有逻辑，减少冲突。

---

## 8. 部署验证清单

- [ ] `docker logs` 无 nginx 报错，`curl :3000/api/health` → ok
- [ ] 首页可登录（管理员账号），右上角头像菜单出现「管理后台」
- [ ] `/admin` 五个页面可打开；系统设置能保存渠道（含 Agnes 协议）
- [ ] 后台渠道模式下生图/文本/视频正常，生成后算力点扣减（头像旁余额变化）
- [ ] 本地渠道模式下 openai/gemini/agnes 直连正常
- [ ] agnes 视频：创建任务 → 轮询 → `metadata.url` 下载成功
- [ ] `data/` 卷持久化：重启容器后用户/算力点/渠道配置不丢

---

## 9. 相关提交索引

| 提交 | 内容 |
|---|---|
| `b099e85` | feat: 前端升级 v0.16.0 + 后端管理接入（281 文件） |
| `8e6fd56` | fix(docker): 修 BOM/CRLF（nginx.conf、entrypoint、start.sh）+ .gitattributes |
| `297e16f` | fix(agnes): 按官方文档修正图片 extra_body.image 与视频 metadata.url（含任务创建/轮询重写） |
