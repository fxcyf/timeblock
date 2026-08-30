# timeblock — 项目指南

> **重要：Claude 必须自主维护本文件。** 架构或约定变化时更新，保持简洁。

## Git 信息

- Remote: https://github.com/fxcyf/timeblock.git
- 默认分支: main

## 当前架构

- 零依赖响应式 Web 原型，使用原生 HTML、CSS 和 ECMAScript modules
- `index.html` / `styles.css` / `app.js`：页面结构、视觉与交互状态
- `src/schedule.js`：时间解析、冲突检测与空档；`src/recurrence.js`：重复实例、移动例外与规则拆分；`src/state.js`：V2 状态迁移；`src/calendar.js`：日期范围；`src/content.js`：内容三态；`src/gesture.js`：长按手势；`src/grid.js`：小时格；`src/group.js`：整组变换；`src/forms.js`：显式表单校验；`src/theme.js`：颜色与对比度；`src/backup.js`：版本化 JSON 备份校验
- `test/`：Node.js 原生测试；`scripts/serve.mjs`：本地静态服务器
- 时间在领域层统一表示为当天分钟数，时间轴覆盖 00:00–24:00；支持 1 日、连续 3 日和周一开始的 7 日视图
- 手动时间块按日期保存在 `blocksByDate`；重复实例由规则动态计算，只在单次修改、移动、完成或取消时写入 `recurrenceExceptions`，跨日期移动使用 `movedToDate` 保持规则归属
- V2 状态写入浏览器 `localStorage` 的 `timeblock-state-v2`；自动迁移旧单日 `blocks`、V1 状态与已复制的重复时间块
- 常驻界面采用文字最少化约定：只显示日期、时间、行动与必要数据，图标按钮必须保留可访问名称
- 所有宽度的“日程”只保留日期范围控制和全宽 24 小时时间轴，不显示进度或辅助面板；桌面/平板使用时间轴内部滚动，移动端时间轴撑开页面并使用页面级滚动
- 手机和平板的 1 日视图使用 24 行 × 4 个 15 分钟格；空白格长按后才进入划选，手指先移动则继续原生滚动；桌面单日及所有 3/7 日视图保持纵向时间轴
- 内容状态为 `oneTime` / `favorite` / `archived`；旧 `favorite:false` 只迁移为 `oneTime`；“管理”页提供常用内容归档、恢复和删除
- “管理”页集中提供强调色/自定义内容颜色、视图偏好、V3 JSON 备份导入导出与清空；应用本地状态仍为 V2、存储键不变
- 日程工具栏固定在可见区域；多选支持复制、删除和拖动任意已选项来移动整组，先校验边界与冲突再原子保存并提供一次撤销
- 重复表单只在保存时显式校验，关闭、取消和 Escape 无条件退出；重复实例编辑/删除支持“仅这一次”和“这一次及以后”
- `.github/workflows/static.yml`：推送 `main` 后自动发布到 GitHub Pages

## 开发命令

- `npm start`：在 `http://localhost:4173` 启动原型
- `npm test`：运行排程领域逻辑测试

## 任务生命周期

你收到任务后，按以下 9 步流程自主完成：

1. **领取任务** — 你已被分配任务，阅读本文件和项目代码理解上下文
2. **创建工作区**:
   - `git fetch origin`（如有 remote）
   - `git worktree add -b task-<简短描述> .claude-manager/worktrees/task-<简短描述> origin/main`
   - 进入 worktree 目录工作（后续所有操作在 worktree 中）
   - 如果 worktree 创建失败，直接在当前分支工作
3. **实现功能** — 编写代码，确保可运行
4. **提交代码** — `git add` + `git commit`，commit message 简洁描述改动
5. **Merge + 测试**:
   - `git fetch origin && git merge origin/main`（集成最新代码，如有 remote）
   - 运行测试（如有测试命令）
6. **自动合并到 main**（如有 remote）:
   - `git fetch origin main`
   - `git rebase origin/main`，如果冲突则自行 resolve
   - 如果成功：`git checkout main && git merge <task-branch> && git push origin main`
   - 如果这一步有任何失败，退回到步骤 5 重试
   - （纯本地项目跳过本步）
7. **标记完成** — 更新文档（必须在清理之前，防止进程被杀时状态丢失）
8. **清理** — 回到项目根目录:
   - `git worktree remove .claude-manager/worktrees/<worktree名>`
   - `git branch -D <task-branch>`
   - 如有 remote: `git push origin --delete <task-branch>`
9. **经验沉淀** — 在 PROGRESS.md 记录经验教训（可选）

### 冲突处理

rebase 发生冲突时：
1. 查看冲突文件: `git diff --name-only --diff-filter=U`
2. 逐个解决冲突
3. `git add <resolved-files> && git rebase --continue`
4. 如果无法解决: `git rebase --abort`，退回步骤 5

### 状态判断

- 通过 `git remote -v` 判断是否有 remote
- 有 remote → 必须完成步骤 6（merge + push）
- 无 remote → 跳过步骤 5 的 fetch、步骤 6 和步骤 8 的远程分支删除

## 文件维护规则

> **以下文件都由 Claude Code 自主维护，每次功能变更后必须同步更新。**

- **CLAUDE.md**（本文件）：架构、约定、关键路径变化时更新，只改变化的部分，保持简洁
- **AGENTS.md**（Codex 读取）：**与 CLAUDE.md 保持关键内容同步**——这是 CC/Codex coding 时的行为纪律：往其中一个写新内容时，把相同的意思也写进另一个（不要求逐字一致）。正常状态它是指向本文件的 symlink（改一处即同步），不要改成独立文件；若两者已是独立文件，不要用 symlink 覆盖已有内容，逐次同步意思即可
- **README.md**：面向用户的文档，功能、使用流程变化时同步更新，保持与实际代码一致
- **TEST.md**：测试指南，新增功能时同步添加测试用例和文档
- **PROGRESS.md**：见下方「经验教训沉淀」

## 测试规范

**开发时必须主动使用测试，不是事后补充！**

- **改代码前**：先跑测试，确认基线全绿
- **改代码后**：再跑一遍确认无回归
- **新增功能**：同步新增测试用例，更新 TEST.md
- **修 bug**：先写复现 bug 的测试（红），修复后确认变绿

## 经验教训沉淀

每次遇到问题或完成重要改动后，要在 PROGRESS.md 中记录：
- 遇到了什么问题
- 如何解决的
- 以后如何避免
- **必须附上 git commit ID**

**同样的问题不要犯两次！**

## 注意事项

- 在 worktree 中工作时，不要切换到其他分支
- 完成任务后确保代码可运行、测试通过
