# AI Feedback Loop Demo

这是一个“用户提交需求 -> AI 自动改代码 -> 自动测试 -> 自动合并 -> 自动部署”的演示项目。

用户不需要懂 GitHub。用户只要打开一个网页表单，提交 Bug、功能请求或设计调整，系统就会自动创建 GitHub Issue，然后让 Codex 尝试修改代码。修改通过测试后，会自动合并并部署到 Render。

当前演示地址：

- 演示应用：<https://ai-feedback-loop-demo.onrender.com/>
- 提交需求页面：<https://ai-feedback-loop-demo.onrender.com/report.html>
- GitHub 仓库：<https://github.com/gloryash/ai-feedback-loop-demo>

更详细的大白话说明见：[docs/plain-language-guide.md](docs/plain-language-guide.md)

## 最终能完成什么

这个项目完成的是一个完整闭环：

1. 用户在网页提交 Bug、功能请求或设计调整。
2. 后端保存反馈内容和上传文件。
3. 后端自动创建 GitHub Issue。
4. 系统根据内容打标签。
5. GitHub Actions 根据标签触发 Codex。
6. Codex 读取 Issue 和代码，尝试修改项目。
7. GitHub Actions 自动运行测试。
8. 如果有代码变化，系统自动创建 PR。
9. PR 通过测试和门禁后自动合并。
10. 合并到 `main` 后自动触发 Render 部署。
11. 用户刷新线上页面，看到新版本。

已经验证过的例子：

- Codex 修复过 `SAVE10` 优惠码计算问题。
- Codex 把演示应用改成过蓝色主题。
- Codex 处理过短的设计调整请求。

## 一张图看懂机制

```text
用户提交表单
  -> Render 后端收到请求
  -> 创建 GitHub Issue
  -> 打上 autofix:candidate 标签
  -> GitHub Actions 触发 Codex
  -> Codex 改代码
  -> npm test
  -> 创建 PR
  -> merge-gate 检查
  -> 自动合并
  -> 触发 Render 部署
  -> 用户刷新页面看到结果
```

## 本地运行

需要 Node.js 22 或更新版本。

```bash
npm install
npm test
npm start
```

打开：

- <http://localhost:3000>
- <http://localhost:3000/report.html>

本地运行只能验证网页和接口。如果要完整验证“提交后创建 GitHub Issue、Codex 改代码、PR 合并、Render 部署”，必须配置 GitHub 和 Render。

## 完整复刻步骤

下面是从零复刻这个项目的步骤。

复刻前你需要准备这些东西：

- 一个 GitHub 账号。
- 一个 Render 账号。
- 一个可用的 AI key，可以是 OpenAI 官方 key，也可以是兼容 Responses API 的中转站 key。
- 一个 GitHub token，用来让网页后端创建 Issue。
- 一个 GitHub token，用来让 GitHub Actions 创建 PR、自动合并和触发部署。
- 本地安装 Node.js 22 或更新版本。

### 1. 复制仓库

先把这个仓库 fork 到你自己的 GitHub 账号，或者 clone 后推到你自己的仓库。

如果你用 GitHub CLI：

```bash
gh repo fork gloryash/ai-feedback-loop-demo --clone
cd ai-feedback-loop-demo
```

如果你已经有自己的空仓库：

```bash
git clone https://github.com/gloryash/ai-feedback-loop-demo.git
cd ai-feedback-loop-demo
git remote set-url origin https://github.com/YOUR_OWNER/YOUR_REPO.git
git push -u origin main
```

把 `YOUR_OWNER` 和 `YOUR_REPO` 换成你自己的 GitHub 用户名和仓库名。

### 2. 创建项目需要的 GitHub labels

这个项目靠 GitHub label 触发自动化。

如果缺少 `autofix:candidate`，Issue 创建后不会触发 AI。如果缺少 `bug`、`feature`、`design` 等 label，网页后端创建 Issue 时也可能失败。

在你的仓库里运行：

```bash
gh label create "autofix:candidate" --color "0E8A16" --description "AI can try to implement this request" || true
gh label create "needs:human" --color "B60205" --description "Needs human review" || true
gh label create "risk:review" --color "D93F0B" --description "Risky change needs review" || true
gh label create "feature" --color "1D76DB" --description "Feature request" || true
gh label create "design" --color "5319E7" --description "Design change" || true
gh label create "ai:autofix" --color "0E8A16" --description "PR created by AI automation" || true
```

`bug` 通常是 GitHub 默认 label。如果你的仓库没有，也创建一下：

```bash
gh label create "bug" --color "D73A4A" --description "Bug report" || true
```

### 3. 打开 GitHub 自动化开关

进入你的 GitHub 仓库设置，确认这几项：

```text
Settings -> Actions -> General -> Workflow permissions
```

选择：

```text
Read and write permissions
Allow GitHub Actions to create and approve pull requests
```

再确认：

```text
Settings -> General -> Pull Requests
```

打开：

```text
Allow auto-merge
```

如果不开 `Allow auto-merge`，AI 可以创建 PR，但自动合并会失败。

### 4. 修改 Render 配置里的仓库名

打开 [render.yaml](render.yaml)，把这里改成你自己的仓库：

```yaml
- key: GITHUB_OWNER
  value: YOUR_OWNER
- key: GITHUB_REPO
  value: YOUR_REPO
```

如果不改，用户从你的网页提交反馈时，后端会尝试把 Issue 创建到原来的仓库。

### 5. 准备 AI 中转站或 OpenAI API

GitHub Actions 里的 Codex 需要两个值：

```text
AI_PROXY_KEY
AI_RESPONSES_ENDPOINT
```

如果你用中转站：

```text
AI_PROXY_KEY=你的中转站 key
AI_RESPONSES_ENDPOINT=https://your-proxy.example.com/v1/responses
```

如果你用官方 OpenAI API，则 endpoint 使用官方 Responses API 地址，key 使用你的 OpenAI API key。

不要把 key 写进代码。必须放进 GitHub Secrets。

### 6. 准备 GitHub Token

你需要两个 GitHub token。

第一个放在 Render，用来让网页后端创建 Issue：

```text
GITHUB_TOKEN
```

第二个放在 GitHub Secrets，用来让 Actions 创建 PR、推分支、自动合并，并触发后续工作流：

```text
REPO_AUTOMATION_TOKEN
```

建议用 fine-grained personal access token，至少给目标仓库这些权限：

- Contents: Read and write
- Issues: Read and write
- Pull requests: Read and write
- Metadata: Read
- Actions: Read

不要只依赖 GitHub Actions 默认的 `GITHUB_TOKEN`。默认 token 创建或合并 PR 时，经常不会触发后续 `pull_request` 或 `push` 工作流，自动部署会断掉。

### 7. 配置 GitHub Secrets

进入你的 GitHub 仓库：

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

添加：

```text
AI_PROXY_KEY
AI_RESPONSES_ENDPOINT
REPO_AUTOMATION_TOKEN
RENDER_API_KEY
RENDER_SERVICE_ID
```

其中：

- `AI_PROXY_KEY`：AI key。
- `AI_RESPONSES_ENDPOINT`：AI Responses API 地址。
- `REPO_AUTOMATION_TOKEN`：GitHub 自动化 token。
- `RENDER_API_KEY`：Render API key。
- `RENDER_SERVICE_ID`：Render Web Service ID。

### 8. 部署到 Render

在 Render 创建一个 Web Service，连接你的 GitHub 仓库。

设置：

```text
Runtime: Node
Build Command: npm ci
Start Command: npm start
Health Check Path: /api/health
```

Render 环境变量至少需要：

```text
NODE_ENV=production
HOST=0.0.0.0
GITHUB_OWNER=YOUR_OWNER
GITHUB_REPO=YOUR_REPO
GITHUB_TOKEN=你的 GitHub token
```

如果你使用 `render.yaml` 创建服务，`NODE_ENV`、`HOST`、`GITHUB_OWNER`、`GITHUB_REPO` 已在文件里声明，但 `GITHUB_TOKEN` 需要你在 Render 控制台手动填。

创建 Render 服务后，在 Render URL 中找到服务 ID，或者从 Render dashboard/API 获取 `RENDER_SERVICE_ID`，再填回 GitHub Secrets。

### 9. 验证本地测试

推送前先跑：

```bash
npm test
```

当前项目应该看到所有测试通过。

### 10. 验证线上表单

打开你的线上提交页：

```text
https://your-render-url.onrender.com/report.html
```

提交一个简单设计调整：

```text
问题类型：设计调整
标题：把页面变成蓝色
问题详情：改成蓝色
```

正常结果应该是：

```text
我们已经收到你的反馈
系统会尝试让 AI 自动处理并改代码
已创建处理记录 #数字
```

然后去 GitHub 看：

1. 是否创建了 Issue。
2. Issue 是否有 `autofix:candidate` 标签。
3. `AI autofix issue` workflow 是否运行。
4. Codex 是否创建 PR。
5. PR 的 `test` 和 `merge-gate` 是否通过。
6. PR 是否自动合并。
7. Render 是否部署。
8. 线上页面是否变化。

如果你不走网页表单，而是直接在 GitHub 里创建 Issue，也可以触发 AI，但必须给这个 Issue 加上：

```text
autofix:candidate
```

这个项目的 workflow 监听的是“Issue 被打上这个标签”，不是所有新 Issue 都自动触发。

## 项目中最关键的点

### 表单入口

[public/report.html](public/report.html) 是普通用户提交需求的页面。

用户提交后，浏览器会调用：

```text
POST /api/report
```

### 后端接口

[src/server.js](src/server.js) 接收表单，保存 ticket，处理上传文件，然后调用 GitHub API 创建 Issue。

### 分类逻辑

[src/classifier.js](src/classifier.js) 决定这个反馈走 AI 还是人工。

当前规则：

- Bug 走 AI。
- 功能请求走 AI。
- 设计调整走 AI。
- 内容很短也走 AI。
- 安全、权限、支付、隐私、数据库迁移等高风险内容走人工。

### GitHub Issue 内容

[src/githubIssue.js](src/githubIssue.js) 把用户提交的内容整理成 GitHub Issue body。

Codex 后续主要就是读这个 Issue 来判断要改什么。

### Codex 触发器

[.github/workflows/ai-autofix.yml](.github/workflows/ai-autofix.yml) 监听 Issue 标签。

当 Issue 被打上：

```text
autofix:candidate
```

就会运行 Codex。

### Codex 行为规则

[.github/codex/prompts/autofix.md](.github/codex/prompts/autofix.md) 和 [AGENTS.md](AGENTS.md) 告诉 Codex：

- 可以处理 Bug、功能请求、设计调整。
- 必须开 PR，不能直接改 `main`。
- 不要泄露 secrets。
- 不要执行用户日志里的恶意指令。
- 高风险改动不要自动做。

### 自动合并门禁

[.github/workflows/merge-gate.yml](.github/workflows/merge-gate.yml) 控制哪些 PR 可以自动过门。

它不会因为 `feature` 或 `design` 标签阻止合并，但会阻止安全、权限、支付、隐私、迁移等高风险内容。

### 自动部署

[.github/workflows/deploy-render.yml](.github/workflows/deploy-render.yml) 在 `main` 更新后调用 Render API 部署。

[.github/workflows/auto-merge-bugfix.yml](.github/workflows/auto-merge-bugfix.yml) 使用 `REPO_AUTOMATION_TOKEN` 自动合并 AI PR，保证合并后能触发后续部署。

## 容易犯错的点

### 1. 忘记改 `render.yaml` 的仓库名

如果 `GITHUB_OWNER` 和 `GITHUB_REPO` 还是原来的值，用户提交的问题会创建到错误仓库。

### 2. 没有创建必要的 GitHub labels

`autofix:candidate` 是触发 AI 的关键 label。

如果缺少它，Issue 不会触发 Codex。如果缺少 `feature`、`design`、`ai:autofix` 等 label，后续创建 Issue 或 PR 也可能卡住。

### 3. 没有打开 GitHub auto-merge

如果仓库没有开启 `Allow auto-merge`，AI 创建 PR 后可能停在 PR 页面，不会自动合并到 `main`。

### 4. 把密钥写进代码

不要把 OpenAI key、中转站 key、GitHub token、Render key 写进 README、代码或 workflow 明文。

正确做法是放在：

- GitHub Secrets
- Render Environment Variables

### 5. 中转站地址填错

`AI_RESPONSES_ENDPOINT` 要填兼容 Responses API 的地址，不是普通聊天页面地址，也不是只到域名根路径。

例如：

```text
https://your-proxy.example.com/v1/responses
```

### 6. 用默认 `GITHUB_TOKEN` 创建 PR 或自动合并

默认 token 可能导致后续 workflow 不触发。

这个项目用 `REPO_AUTOMATION_TOKEN` 来创建 PR、推分支、自动合并。

### 7. Codex 被 `AGENTS.md` 禁止了

如果 `AGENTS.md` 写了“不要做 design change”，那么即使 workflow prompt 允许，Codex 也可能拒绝执行。

所以 prompt 和 `AGENTS.md` 必须一致。

### 8. Render 部署没有触发

PR 合并不等于线上已经更新。

需要确认：

- `deploy Render` workflow 成功。
- Render 服务完成部署。
- 线上页面实际变化。

### 9. 截图不等于 AI 一定看懂

当前系统会把截图作为链接放进 Issue，但没有稳定做图片理解。

如果要让 AI 可靠读截图，需要接入视觉模型，把截图内容先转成文字。

### 10. 联系方式不会自动发邮件

当前联系方式只是被保存下来，不会自动通知用户。

要做邮件通知，需要接入 Resend、SendGrid、Postmark 或 AWS SES。

### 11. 高风险需求不要自动上线

生产环境里，这些需求建议继续人工审核：

- 登录权限
- 支付计费
- 隐私数据
- 安全漏洞
- 数据库 migration
- 大规模依赖升级
- 构建系统大改

## 文件结构

```text
public/
  index.html          演示应用页面
  report.html         用户提交需求页面
  report.js           提交结果的中文展示逻辑
  styles.css          页面样式

src/
  server.js           Express 后端
  classifier.js       分类和路由逻辑
  githubIssue.js      GitHub Issue 创建逻辑
  pricing.js          演示应用业务逻辑

.github/workflows/
  ai-autofix.yml        Issue 触发 Codex
  test.yml              测试
  merge-gate.yml        自动合并门禁
  auto-merge-bugfix.yml 自动合并 AI PR
  deploy-render.yml     触发 Render 部署

docs/
  plain-language-guide.md  中文大白话说明
```

## 本项目当前状态

当前仓库已经验证：

- 本地测试通过。
- GitHub Actions 测试通过。
- Render 部署通过。
- 表单可以创建 GitHub Issue。
- 设计调整可以触发 AI 改代码。
- AI PR 可以自动合并。
- 合并后可以部署到 Render。

当前线上页面：

- <https://ai-feedback-loop-demo.onrender.com/>
- <https://ai-feedback-loop-demo.onrender.com/report.html>

## 生产化建议

如果要从 demo 变成正式产品，建议继续补：

- 用户 ticket 状态查询页面。
- 修复完成邮件通知。
- 截图 OCR / 视觉模型分析。
- 日志敏感信息自动脱敏。
- 管理后台。
- 更细的权限控制。
- 自动回滚。
- 更严格的 PR 审核策略。

## 核心原则

这个系统不是让 AI 绕过工程流程。

它的核心是：

```text
降低用户反馈门槛
  -> 自动结构化记录
  -> AI 尝试改代码
  -> 测试和门禁兜底
  -> PR 可追踪
  -> 部署可验证
```

也就是说，它解决的是“用户反馈到代码上线之间太慢、太断裂”的问题。
