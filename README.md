# Timeblock

一个为“下班后几小时”设计的轻量时间块应用。它把快速排程和重复日程放在同一个流程里：常规节奏自动出现，临时想做的事一句话就能放进今晚。

在线体验：<https://fxcyf.github.io/timeblock/>

## 核心体验

- **今晚时间轴**：集中查看 18:30–23:30 的安排、留白和完成进度。
- **一句话添加**：支持输入 `19:00 吃晚饭 40分钟`，也可以只写事项并自动寻找下一个空档。
- **直接调整**：拖动时间块改变开始时间，拖动底部把手改变时长，点击可精确编辑。
- **重复日程**：按星期设置日程；当天规则自动生成，也可以暂停或临时加入今晚。
- **柔性提醒**：冲突时不覆盖原安排，排得太满时提示给切换和休息留时间。
- **本地优先**：数据保存在浏览器 `localStorage`，原型不需要账号或后端。

完整产品取舍与交互状态见 `PRODUCT_DESIGN.md`。

## 本地运行

需要 Node.js 20 或更新版本，无第三方依赖。

```bash
npm start
```

然后打开 `http://localhost:4173`。

## 部署

仓库使用 GitHub Pages 自动部署。推送到 `main` 后，`.github/workflows/deploy-pages.yml` 会发布当前静态站点，无需自建服务器或手动上传文件。

首次部署需要在仓库 Settings → Pages 中将 Source 设为 **GitHub Actions**；后续更新均由工作流自动完成。

## 测试

```bash
npm test
```

自动化测试覆盖时间解析、快速输入、冲突判断、空档寻找和重复规则。手动验收步骤见 `TEST.md`。

## 项目结构

```text
index.html             页面结构与可访问性语义
styles.css             响应式视觉与交互状态
app.js                 页面状态、持久化和用户交互
src/schedule.js        可独立测试的排程领域逻辑
test/schedule.test.js  Node.js 原生测试
scripts/serve.mjs      零依赖本地静态服务器
```
