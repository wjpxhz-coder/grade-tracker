# Supabase 后端部署与清理任务

本目录包含数据库迁移、`purge-deleted` 与 `analyze-exam-images` Edge Function。正式项目应按以下顺序执行：迁移、初始化双账号、部署函数、配置 Function/Vault secrets、验证功能与 Cron。

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

## 部署 AI 图片摘要函数

`analyze-exam-images` 固定使用 `gpt-5.5` 和提示词版本 `exam-image-summary-v1`。它先用调用者 JWT 与 RLS 读取未删除考试、附件及私有 Storage 对象，再由函数计算文件 SHA-256；只有通过这些检查后，service role 才会写入 `ai_attachment_insights`。浏览器账号只有该表的读取权限，不能伪造 AI 摘要。

请先撤销任何曾粘贴到聊天、日志或源码中的 API key，并在 NewAPI 后台生成新 key。不要把 key 写入 `.env.local`、迁移、前端变量或本文件。推荐在 Supabase Dashboard 的 Edge Functions Secrets 中配置：

```text
NEWAPI_BASE_URL=https://YOUR_NEWAPI_HOST
NEWAPI_API_KEY=REPLACE_WITH_A_NEW_SECRET
NEWAPI_API_MODE=responses
AI_ANALYSIS_ALLOWED_ORIGINS=https://wjpxhz-coder.github.io,http://localhost:5173,http://localhost:4173
```

其中 `NEWAPI_BASE_URL` 可填写站点根地址、以 `/v1` 结尾的地址，或完整的 `/v1/responses` 地址；函数会安全拼接端点。线上地址必须使用 HTTPS。`NEWAPI_API_MODE` 只能是 `responses` 或 `chat`，省略时默认为 `responses`；建议先用不含真实成绩的合成图片探测代理兼容性，如果代理虽然暴露 Responses 路由却不完整支持所需字段，再固定为 `chat`，不要拿真实整图反复试错。`AI_ANALYSIS_ALLOWED_ORIGINS` 是逗号分隔的浏览器 Origin，不要包含路径。非法 URL 或 API mode 会返回 `server_not_configured`。

部署：

```powershell
npx supabase functions deploy analyze-exam-images --use-api
```

函数请求体：

```json
{
  "examId": "考试 UUID",
  "attachmentIds": ["可选的附件 UUID"],
  "force": false
}
```

省略 `attachmentIds` 时处理该考试的全部未删除图片；单次最多 4 张，超过时应由前端按 4 张分批明确选择。`force=false` 会优先复用同一附件摘要或相同实际 SHA-256、模型、提示词版本的缓存。摘要提示词不包含文件名、页码等附件元数据，因此相同图片的跨附件缓存语义保持一致。`force=true` 会重新调用模型。

成功或部分成功返回示例：

```json
{
  "examId": "考试 UUID",
  "model": "gpt-5.5",
  "promptVersion": "exam-image-summary-v1",
  "counts": { "total": 2, "cached": 1, "analyzed": 1, "failed": 0 },
  "items": [
    { "attachmentId": "附件 UUID", "status": "cached", "insight": {} },
    { "attachmentId": "附件 UUID", "status": "analyzed", "insight": {} }
  ],
  "usage": { "prompt_tokens": 1200, "completion_tokens": 350, "total_tokens": 1550 }
}
```

函数优先调用 OpenAI 兼容的 `/v1/responses`，以 `detail=high` 分析单图、使用严格 JSON Schema、`reasoning.effort=low`、`max_output_tokens=1800` 且 `store=false`。只有端点返回 404 或明确说明不支持 Responses API 时才回退 `/v1/chat/completions`；鉴权失败、限流、服务端错误和超时都不会回退或自动重试，避免重复计费。原图/base64、请求体、API key 和供应商响应正文不会写入日志。

常见顶层错误码：`unauthorized`、`origin_not_allowed`、`exam_forbidden`、`exam_not_found`、`invalid_attachment_selection`、`too_many_attachments`、`server_not_configured` 与 `provider_error`。单图错误会出现在对应 item 的 `error`，其他图片仍可继续时返回 HTTP 200；全部图片均因供应商失败时返回 HTTP 502。

## 权限验收重点

- 匿名用户只能读取两个登录卡片，不能读取考试、心得、附件或审计数据。
- `shared` 考试允许空间内双方共同维护；`private` 只允许 `student_id` 本人读取和维护。
- 未删除心得双方可读，但只有 `author_id` 能新增后修改、删除、查看或恢复自己已删除的心得。
- Storage bucket 始终为 private，访问由路径内的 `space_id/exam_id` 与数据库权限共同校验。
- `ai_attachment_insights` 对可见考试只读；只有完成 JWT/RLS 校验的 Edge Function 能写入，缓存键为实际文件 SHA-256、模型和提示词版本。
- `save_exam`、删除和恢复都以 `version` 做乐观锁；冲突返回稳定消息 `version_conflict`。
