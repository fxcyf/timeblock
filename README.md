# Timeblock

一个用于快速安排每天和周末的轻量时间块应用。它把直接划选、可复用内容和真正可管理的重复日程放在同一个本地优先流程里。

在线体验：<https://fxcyf.github.io/timeblock/>

## 核心体验

- **全天时间轴**：00:00–24:00 都可安排，默认滚到当前时刻附近；手机和平板的单日视图使用 24 行 × 4 个 15 分钟格，短事项也有足够触控面积。
- **多日视图**：在 1 日、连续 3 日和完整一周之间切换；周视图从周一开始。
- **专注日程页**：桌面、平板和手机都只显示日期控制与全宽时间轴，不在其旁边或下方堆放其他面板。
- **划选即创建**：桌面端在空白处拖动；触屏先长按再跨格拖动，松手后选择常用事件内容即可完成。普通滑动仍用于滚动。
- **固定日期工具栏**：日期、翻页、今天、1/3/7 日和选择入口始终停留在可见区域顶部；触屏窄视口会避开 iPadOS 安全区并保留边缘间距。
- **常用内容管理**：内容分为一次性、常用和已归档三态；“管理”页支持新增、编辑、排序、归档、恢复和彻底删除，模板变化不会改写已有时间块快照。
- **少文字界面**：常驻页面只显示日期、时间、行动和必要数据；导航与次要操作改用带可访问名称的图标。
- **直接调整**：拖动时间块改变开始时间，拖动底部把手改变时长，点击可精确编辑。
- **批量调整**：进入“选择”模式后可多选时间块，直接拖动任意已选项来重新安排整组，也可统一后移 15/30 分钟、复制或删除；任一目标冲突或越界时整组回到原位，移动和删除均可撤销。
- **跨日安排**：每个日期独立保存时间块，编辑时可以把安排移动到另一日。
- **动态重复日程**：规则按星期和生效日期动态生成实例，可编辑、暂停和删除；单个实例支持“仅这一次”和“这一次及以后”，移动单次实例仍保留规则归属。
- **快速恢复**：删除、移动、规则与常用内容修改后可立即撤销一次。
- **柔性提醒**：冲突时不覆盖原安排，排得太满时提示给切换和休息留时间。
- **本地优先与可选云同步**：V2 数据始终先保存在浏览器 `localStorage`，无需登录即可使用；登录后通过 Supabase 自动同步到其他设备，离线修改会在恢复网络后上传，双端同时修改时由用户明确选择版本。
- **数据管理**：时间块只表达安排，不记录完成状态。“管理”页可导出/导入 V3 JSON 备份、调整时间吸附、默认视图和强调色，或确认后清空。
- **更易阅读**：正文以 17px 为基准，桌面操作区不低于 40px、触屏操作区不低于 44px；统一主题焦点环，不依赖浏览器默认黑色描边。
- **安全区适配**：移动端顶部工具栏和底部导航均与屏幕边缘留白，底部导航采用完整圆角边框；编辑弹窗居中显示，内容选择、多选操作和撤销反馈不会占用底部高频导航区。

完整产品取舍与交互状态见 `PRODUCT_DESIGN.md`。

## 本地运行

需要 Node.js 20 或更新版本，无第三方依赖。

```bash
npm start
```

然后打开 `http://localhost:4173`。

## 部署

仓库使用 GitHub Pages 自动部署。推送到 `main` 后，`.github/workflows/static.yml` 会发布当前静态站点，无需自建服务器或手动上传文件。

首次部署需要在仓库 Settings → Pages 中将 Source 设为 **GitHub Actions**；后续更新均由工作流自动完成。

### Supabase 云同步初始化

前端只包含可公开的 Project URL 与 Publishable key。首次启用云同步前还需要：

1. 在 Supabase Dashboard → SQL Editor 执行 `supabase/schema.sql`，创建 `timeblock_states` 并启用按用户隔离的 RLS。
2. 在 Authentication → URL Configuration 将 Site URL 设为 `https://fxcyf.github.io/timeblock/`，并把该地址及本地开发地址 `http://localhost:4173/` 加入 Redirect URLs。
3. 确认 Email 登录已启用。若开启邮箱确认，新用户需先点击验证邮件再登录。

Publishable key 出现在浏览器和仓库中是正常的；不要把 `sb_secret_...`、`service_role` 或数据库密码写入前端。数据访问由登录令牌和 `supabase/schema.sql` 中的 RLS 共同限制。

## 测试

```bash
npm test
```

自动化测试覆盖内容三态迁移、主题颜色、小时格坐标、整组移动/复制、iPadOS 安全区、全天边界、日期范围、重复例外和 JSON 备份兼容。手动验收步骤见 `TEST.md`。

## 项目结构

```text
index.html             页面结构与可访问性语义
styles.css             响应式视觉与交互状态
app.js                 页面状态、持久化和用户交互
src/schedule.js        时间解析、冲突与空档领域逻辑
src/recurrence.js      动态重复实例、例外与规则拆分
src/state.js           V2 状态与旧数据迁移
src/calendar.js        日期范围与日期运算
src/content.js         事件内容、分类、排序和删除
src/gesture.js         移动端长按与滚动的手势判定
src/grid.js            单日小时格坐标、选区与跨小时分片
src/group.js           多选复制、直接拖动与整体移动的原子预检
src/forms.js           重复表单显式校验
src/theme.js           预设/自定义颜色、对比度与主题令牌
src/backup.js          V3 JSON 备份生成、兼容导入与数据校验
src/cloud.js           Supabase 登录、会话刷新、云状态读写与同步决策
src/cloud-config.js    可公开的 Supabase 项目配置
supabase/schema.sql    云状态表、授权和用户级 RLS
test/schedule.test.js  Node.js 原生测试
test/calendar.test.js  多日范围与迁移测试
test/gesture.test.js   长按移动容差测试
test/backup.test.js    备份往返、原始状态导入与异常拒绝
test/content.test.js   事件内容领域逻辑测试
test/recurrence.test.js 动态重复与例外测试
test/state.test.js     V1→V2 状态迁移测试
test/grid.test.js      小时格与跨小时分片测试
test/group.test.js     整组操作、边界与冲突测试
test/layout.test.js    iPadOS 安全区与移动端边缘间距测试
test/forms.test.js     重复表单取消与保存校验测试
test/theme.test.js     自定义颜色和文字对比度测试
test/cloud.test.js     云认证请求、同步决策、RLS 与公开配置测试
scripts/serve.mjs      零依赖本地静态服务器
```
