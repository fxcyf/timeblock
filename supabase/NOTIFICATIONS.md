# 时间块通知部署

网页与 Service Worker 会随 GitHub Pages 自动发布；数据库、Edge Function 和每分钟定时任务需在当前 Supabase 项目中初始化一次。

## 1. 数据库

在 Supabase SQL Editor 重新执行 `supabase/schema.sql`，创建带 RLS 的 `push_subscriptions` 和仅服务端可访问的 `push_deliveries`。

## 2. VAPID 与函数密钥

在本机运行：

```bash
npm run push:keys
openssl rand -hex 32
```

第一条命令输出一对 VAPID 公私钥，第二条命令输出定时任务密钥。私钥和定时任务密钥不得写入仓库。用 Supabase CLI 配置：

```bash
supabase link --project-ref dfacbnpvvyasilnznmtm
supabase secrets set VAPID_PUBLIC_KEY='<public key>' VAPID_PRIVATE_KEY='<private key>' VAPID_SUBJECT='mailto:<operator email>' REMINDER_CRON_SECRET='<cron secret>'
supabase functions deploy push-subscriptions --no-verify-jwt
supabase functions deploy send-reminders --no-verify-jwt
```

两个函数均关闭网关的旧 JWT 校验：订阅函数会向 Supabase Auth 验证用户令牌，发送函数则要求独立的 `x-cron-secret`。

## 3. 每分钟调度

在 SQL Editor 创建 Vault secrets，`timeblock_reminder_cron_secret` 必须与上一步的 `REMINDER_CRON_SECRET` 完全一致：

```sql
select vault.create_secret('https://dfacbnpvvyasilnznmtm.supabase.co', 'timeblock_project_url');
select vault.create_secret('<cron secret>', 'timeblock_reminder_cron_secret');
```

随后执行 `supabase/schedule-reminders.sql`。它会移除同名旧任务，再创建每分钟调用一次 `send-reminders` 的任务。

## 4. 验证

登录 Timeblock，在“管理 → 时间块通知”开启当前设备，再在新建、编辑时间块或重复规则时选择开始提醒、结束提醒或两者。未选择提醒的事件不会推送；旧安排升级后默认静默。iPhone 和 iPad 必须先用 Safari 添加到主屏幕，并从主屏幕启动。macOS 可直接在受支持的 Safari、Chrome 或 Edge 中授权。

可以在 Edge Function 日志确认 `send-reminders` 返回的 `sent`、`removed` 和 `failed` 计数。提醒采用三分钟回看窗口并以 `push_deliveries` 去重，因此短暂的调度延迟不会重复发送。
