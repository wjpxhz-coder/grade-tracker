# Supabase 后端部署与清理任务

本目录包含完整初始迁移和 `purge-deleted` Edge Function。正式项目应按以下顺序执行：迁移、初始化双账号、部署函数、创建 Vault secret、验证 Cron。

## 应用迁移

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

初始迁移会创建业务表、RLS、私有 `exam-attachments` bucket、审计触发器、清理 RPC，以及每天北京时间 11:15 运行的 `purge-deleted-daily` Cron。迁移不会保存任何项目密钥；两个 Vault secret 尚未配置时，定时命令会安全地跳过网络请求。

## 初始化两个固定账号

根目录的 `.env.local` 需要包含：

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_REPLACE_ME
COUPLE_USER_1_EMAIL=person-one@non-personal.example
COUPLE_USER_1_PASSWORD=replace-with-a-long-random-password
COUPLE_USER_1_NICKNAME=我
COUPLE_USER_1_ALIAS=person-one
COUPLE_USER_2_EMAIL=person-two@non-personal.example
COUPLE_USER_2_PASSWORD=replace-with-another-long-random-password
COUPLE_USER_2_NICKNAME=她
COUPLE_USER_2_ALIAS=person-two
```

运行：

```powershell
npm run bootstrap:users
```

脚本可重复运行；已有账号的口令默认不会改变。管理员需要手动重置时，将目标新口令只写入对应的 `COUPLE_USER_N_PASSWORD` 环境变量或 `.env.local`，再运行：

```powershell
npm run bootstrap:users -- --reset-password person-one
```

新口令不会作为命令行参数出现。`profiles.login_email` 用于把公开登录卡片的别名映射到 Supabase Auth 登录标识，因此建议使用专为本网站创建的非个人邮箱标识；昵称、别名和该登录标识都不应视为秘密。真正的安全边界是强口令、Auth 与 RLS。

## `save_exam` 输入

考试和完整分科数组由一个事务保存。新建时省略 `id` 并将 `expected_version` 传为 `null`；更新时必须传当前 `version`：

```json
{
    "payload": {
    "id": "可选 UUID",
    "space_id": "UUID",
    "student_id": "UUID",
    "title": "期中考试",
    "exam_date": "2026-07-16",
    "kind": "comprehensive",
    "primary_subject": null,
    "total_score": 560,
    "total_full_score": 750,
    "rank_value": 28,
    "participant_count": 900,
    "rank_scope": "overall",
    "visibility": "shared",
    "subject_scores": [
      {
        "subject": "math",
        "score": 126,
        "full_score": 150,
        "rank_value": null,
        "participant_count": null
      }
    ]
  },
  "expected_version": null
}
```

RPC 返回完整 `exams` 行。`subject_scores` 是替换语义：数组中缺少的旧科目会在同一事务内删除。单科测验使用 `kind=single_subject`、对应的 `primary_subject` 和 `rank_scope=subject`。

附件对象路径必须使用：

```text
<space_id>/<exam_id>/<attachment_id>.webp
<space_id>/<exam_id>/<attachment_id>-thumb.webp
```

先在客户端生成 `attachment_id`，上传两个私有对象，再插入同 ID 的 `attachments` 元数据。若元数据写入失败，客户端应立即删除刚上传的对象。正常删除只更新附件的 `deleted_at`，不要立即删除 Storage 对象，才能在 30 天内恢复。

## 部署清理函数

生成至少 32 字符的独立随机口令。将同一个值分别保存为 Function secret `PURGE_CRON_SECRET` 与 Vault secret `purge_cron_secret`：

```powershell
$env:PURGE_CRON_SECRET = Read-Host -MaskInput "输入清理任务随机口令"
npx supabase secrets set "PURGE_CRON_SECRET=$env:PURGE_CRON_SECRET"
npx supabase functions deploy purge-deleted --use-api
```

`config.toml` 对该函数关闭网关 JWT 检查，因为当前 publishable key 不保证是 JWT。函数入口仍是私有操作：它会以恒定时间比较 `x-cron-secret`，少于 32 字符或不匹配都会拒绝请求。不要将 service-role key、账号口令或前端 key 放进 Cron 请求。

在 Supabase SQL Editor 中执行以下模板，替换两个占位值。第二个值必须与上一步完全相同：

```sql
select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'project_url',
  'Edge Function base URL for the deleted-record purge job'
);

select vault.create_secret(
  'REPLACE_WITH_THE_SAME_32_PLUS_CHARACTER_SECRET',
  'purge_cron_secret',
  'Dedicated x-cron-secret for purge-deleted'
);
```

如果同名 secret 已存在，请在 Dashboard 的 Vault 页面更新它，不要创建多个同名值。每日任务（`03:15 UTC`，即北京时间 `11:15`）已经由迁移幂等创建，无需再手工粘贴 `cron.schedule`。两个 secret 就绪后可从 Integrations > Cron 手动运行一次验证。

检查任务和最近结果：

```sql
select jobid, jobname, schedule, active from cron.job;

select jobid, status, return_message, start_time, end_time
from cron.job_run_details
order by start_time desc
limit 20;
```

清理函数先原子认领超过 30 天的软删除考试或附件，删除其 Storage 对象，成功后才硬删除数据库行；单独删除的心得及其审计快照也会到期清除。它还会回收上传中断后超过 24 小时、没有附件元数据引用的 Storage 孤儿对象。认领期间恢复操作会返回 `purge_in_progress`；失败认领会主动释放，意外中断的认领会在一小时后自动过期。

## 权限验收重点

- 匿名用户只能读取两个登录卡片，不能读取考试、心得、附件或审计数据。
- `shared` 考试允许空间内双方共同维护；`private` 只允许 `student_id` 本人读取和维护。
- 未删除心得双方可读，但只有 `author_id` 能新增后修改、删除、查看或恢复自己已删除的心得。
- Storage bucket 始终为 private，访问由路径内的 `space_id/exam_id` 与数据库权限共同校验。
- `save_exam`、删除和恢复都以 `version` 做乐观锁；冲突返回稳定消息 `version_conflict`。
