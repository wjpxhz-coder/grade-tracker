# 安全、备份与日常运维

## 权限与密钥

本项目真正的安全边界是 Supabase Auth、数据库 RLS 和 Storage policy，不是登录页上显示的昵称或别名。

- `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY` 是公开客户端配置。
- `SUPABASE_SERVICE_ROLE_KEY`/secret key 可绕过 RLS，只能保存在管理员本机的 `.env.local` 或受控密码库。
- `PURGE_CRON_SECRET` 是至少 32 字符的独立机器间口令，应只保存在 Function Secrets 和 Vault；它不能复用账号口令或 `service_role`。
- 每次修改 RLS 后，至少用匿名窗口、两个正式账号和一个无成员资格的测试账号验证读写边界；测试账号验证完成后立即删除。
- 附件 bucket 必须保持 private。应用应通过短期 signed URL 查看图片，不能改成 public URL。
- 试卷可能包含姓名、学校、考号等敏感信息；上传前裁剪或遮挡，并确认客户端已移除 EXIF。

如怀疑 secret key 泄漏，应立即在 Supabase Dashboard 轮换对应 secret、更新管理员本机配置，并检查 Auth、数据库审计记录和 Storage 是否有异常访问。不要把 secret key 配置成 GitHub Pages 的 Repository variable 或 secret，因为纯前端构建根本不需要它。

## 备份

Supabase 的数据库备份只包含 Storage 元数据，不包含实际图片对象。因此完整备份必须同时保留结构化记录和图片。

推荐每月一次、重大改动前一次：

1. 在网站设置页执行“一键导出”。
2. 确认 ZIP 能正常解压，且包含 `schema_version`、JSON、CSV、心得、附件清单和图片目录；图片较多时会生成多个带 `part-N-of-M` 的分卷，必须一起保存。
3. 抽查至少一场考试：分数、分科、心得和图片均能对应。
4. 将 ZIP（包括全部分卷）复制到两个不同位置，其中至少一个不与当前电脑同步删除。
5. 记录导出日期和文件校验值；不要把导出包提交到 GitHub。

本项目的无 Docker 部署流程不包含 Supabase CLI `db dump`；该命令还需要单独准备容器环境，并且 schema 与业务数据要分别导出。当前 MVP 以网站生成的完整 ZIP 或完整分卷组作为主要离线备份；免费层尤其应自行定期导出，删除整个 Supabase 项目也会永久删除平台侧备份。

参考：[Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)。

## 回收站与永久清理

- 普通删除只做软删除，项目在回收站保留 30 天；期间双方可以恢复有权访问的共享记录。
- 每日 Cron 永久清除超过保留期的考试、图片、心得及其相关审计快照。清理顺序先删除 Storage 中的实际图片，再删除数据库记录；超过 24 小时且没有元数据引用的上传残留也会回收。
- 每月在 Dashboard 的 Integrations > Cron 查看最近运行状态；出现失败时，在修复前不要手动删除数据库中的附件元数据。
- 回收站不是备份。超过 30 天的记录和图片无法依靠应用恢复。

可用以下只读 SQL 查看近期任务结果（表结构由 `pg_cron` 提供）：

```sql
select jobid, status, start_time, end_time, return_message
from cron.job_run_details
order by start_time desc
limit 20;
```

## 手动重置口令

账号使用专用的非个人/合成邮箱标识，不依赖邮件恢复。忘记口令时由持有 secret key 的管理员在本机重置，不能通过网页前端或数据库表直接修改密码。

1. 在 Supabase Dashboard 的 Authentication > Users 中确认目标账号和登录别名。
2. 在管理员电脑更新 `.env.local` 中该账号的 `COUPLE_USER_1_PASSWORD` 或 `COUPLE_USER_2_PASSWORD`，使用新的长随机口令。
3. 使用登录卡片上的别名显式重置目标账号；新口令只从对应的 `PASSWORD` 环境变量读取：

   ```powershell
   npm run bootstrap:users -- --reset-password person-one
   ```

4. 确认脚本只更新目标固定账号，不创建第三个成员；随后用新口令登录。普通的 `npm run bootstrap:users` 是幂等初始化，不会修改已有账号的口令。
5. 将新口令保存进密码管理器，并从终端历史、临时笔记和剪贴板中清除。

Supabase Admin API 的密码更新必须只在可信服务端或本机环境执行；官方明确禁止在浏览器暴露 `service_role`。参考：[Admin `updateUserById`](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)。

## 发布与故障处理

- GitHub Actions 只有在安装、类型检查、测试和构建全部成功后才发布新版本；失败时先查看最早失败的步骤。
- 页面空白但构建成功时，先核对两个 Repository variables，再检查构建日志中的 `VITE_BASE_PATH` 相关错误；不要在 issue 或截图中暴露真实数据。
- 数据请求返回 401 时重新登录；返回 403 时检查共享空间成员关系和 RLS，不要为“临时修复”关闭 RLS。
- 同时编辑出现版本冲突时重新载入并人工合并，不要绕过版本号强制覆盖。
- Supabase 免费项目暂停或额度接近上限时，先导出完整 ZIP/分卷组，再按 Dashboard 指引恢复或升级；不要直接清空 Storage。
