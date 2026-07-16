# 部署与双账号初始化

本项目采用“GitHub Pages 静态前端 + 托管 Supabase 后端”。以下流程直接连接托管项目，不运行 `supabase start`，因此不需要 Docker。

## 1. 创建 Supabase 项目

1. 在 Supabase Dashboard 创建项目，保存项目引用（project ref）和数据库口令。
2. 在项目的 API Keys 页面取得：
   - Project URL，例如 `https://<project-ref>.supabase.co`；
   - publishable key（旧项目也可能显示 legacy `anon` key）；
   - secret key（旧项目也可能显示 legacy `service_role` key）。
3. 在 Authentication 的 URL 配置中，将 Site URL 设置为最终 Pages 地址，例如 `https://<owner>.github.io/<repo>/`。
4. 在 Authentication 的 Email provider 设置中关闭“允许新用户注册”。本项目的两个账号由管理员脚本创建，不提供前台注册。

publishable key 会出现在网页源码中，这是预期行为；secret/service-role key 能绕过 RLS，绝不能进入前端、GitHub 变量、Actions 日志或提交记录。

## 2. 配置本机环境

安装 Node.js 22.12+ LTS 后，在仓库根目录执行：

```powershell
npm ci
Copy-Item .env.example .env.local
```

填写 `.env.local` 中的浏览器配置、管理员配置和两个账号资料。两个账号应使用不同的长随机口令；推荐至少 16 个字符，并由密码管理器保存。

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_REPLACE_ME
PURGE_CRON_SECRET=replace-with-a-separate-long-random-secret

COUPLE_USER_1_EMAIL=person-one@non-personal.example
COUPLE_USER_1_PASSWORD=replace-with-a-long-random-password
COUPLE_USER_1_NICKNAME=我
COUPLE_USER_1_ALIAS=person-one
COUPLE_USER_2_EMAIL=person-two@non-personal.example
COUPLE_USER_2_PASSWORD=replace-with-another-long-random-password
COUPLE_USER_2_NICKNAME=她
COUPLE_USER_2_ALIAS=person-two
```

使用专为本网站创建的非个人/合成邮箱标识，并由管理员与别名一起妥善记录。登录页需要公开读取别名到 Auth 邮箱标识的映射，所以昵称、别名和该邮箱标识都不能被当成秘密；忘记口令时按运维指南使用本机管理员脚本重置。

## 3. 应用数据库迁移

Supabase CLI 已作为项目开发依赖安装。登录并连接远端项目：

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

先检查 `--dry-run` 输出，再执行实际迁移。不要对正式项目执行 `supabase db reset --linked`；该命令会删除远端数据。后续结构变更也应通过新的迁移文件部署，不要直接在远端 Table Editor 修改结构。

迁移完成后，在 Dashboard 检查：

- 业务表均已启用 RLS；
- 附件 bucket 存在且为 private；
- `save_exam`、`soft_delete_exam`、`restore_exam` 等数据库函数存在；
- 回收站永久清理所需的数据库函数存在。
- `purge-deleted-daily` Cron 已存在（Vault 未配置前会跳过调用）。

## 4. 初始化固定双账号

Windows 上推荐使用遮罩输入脚本。它通过已登录的 Supabase CLI 读取管理员密钥，
不会把密钥或口令写入文件或命令历史：

```powershell
.\scripts\initialize-production.ps1 -ProjectRef YOUR_PROJECT_REF
```

默认昵称为“我 / 她”，登录别名为 `person-one / person-two`。可通过
`-User1Nickname`、`-User1Alias`、`-User2Nickname` 和 `-User2Alias` 自定义。

其他系统仍可确认 `.env.local` 未被 Git 跟踪，然后执行：

```powershell
npm run bootstrap:users
```

初始化脚本使用 Admin API 创建两个已确认账号、个人资料、同一个共享空间及成员关系。成功后：

1. 用第一个账号登录并添加一条测试考试；
2. 用第二个账号确认可以查看和共同编辑；
3. 分别创建“仅自己可见”的测试记录，确认对方不可见；
4. 删除测试数据并检查回收站；
5. 清理正式使用前的所有测试记录。

不要在浏览器控制台、在线 SQL 编辑器或 GitHub Actions 中运行初始化脚本。脚本所需 secret key 只保留在受信任的管理员电脑上。

## 5. 部署并调度永久清理

数据库迁移不会替你保存项目 URL 或清理口令。先部署仓库中的 `purge-deleted` Edge Function：

```powershell
$env:PURGE_CRON_SECRET = Read-Host -MaskInput "粘贴 .env.local 中的 PURGE_CRON_SECRET"
npx supabase secrets set "PURGE_CRON_SECRET=$env:PURGE_CRON_SECRET"
Remove-Item Env:PURGE_CRON_SECRET
npx supabase functions deploy purge-deleted --use-api
```

`--use-api` 让托管平台完成打包，因此这一步同样不需要 Docker。口令通过遮罩提示读取，实际值不会写入命令历史。

然后按 [`supabase/README.md`](../supabase/README.md) 在 Supabase Vault 创建以下两个 secret；每日 Cron 已由数据库迁移创建：

- `project_url`：当前项目 URL；
- `purge_cron_secret`：与 Function secret `PURGE_CRON_SECRET` 完全相同、至少 32 字符的独立随机值。

不要把 publishable key、`service_role` 或账号口令保存进 Cron 请求。`purge-deleted` 禁用 gateway 的旧式 JWT 校验，并在函数内以恒定时间比较专用的 `x-cron-secret`；函数执行清理时只使用平台自动注入的服务端环境。配置后从 Integrations > Cron 手动运行一次，并同时检查 Cron 结果与 Edge Function 日志。

可以在 SQL Editor 只读查看定时任务状态：

```sql
select jobid, jobname, schedule, active
from cron.job
order by jobid;
```

## 6. 配置 GitHub Pages

1. 将源码推送到 GitHub 仓库的 `main` 分支。
2. 打开 **Settings > Secrets and variables > Actions > Variables**，添加：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. 打开 **Settings > Pages**，将 Source 设为 **GitHub Actions**。
4. 在 **Actions** 页面运行 `Deploy to GitHub Pages`，或再次推送 `main`。

这两个值是公开的客户端配置，应使用 Repository variables，而不是把管理 secret 放入 Pages 构建。工作流若检测到变量为空会直接失败。

成功后检查：

- 登录、退出和刷新页面正常；
- `/#/exams/...` 这类 HashRouter 地址刷新后不会 404；
- 浏览器 Network 面板中没有对私有图片的永久公开 URL；
- 未登录窗口无法读取任何业务数据；
- 手机网络环境下可以访问 GitHub Pages 和 Supabase。部分网络可能对这两个服务有不同的可达性，正式录入前应在实际设备上验证。

## 参考

- [Supabase CLI：连接并推送迁移](https://supabase.com/docs/reference/cli/supabase-db-push)
- [Supabase 数据库迁移](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [GitHub Pages 自定义 Actions 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
