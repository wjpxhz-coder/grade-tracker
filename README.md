# 我们的成绩手账

一个只供两个人使用的私密成绩成长手账。前端部署在 GitHub Pages，登录、数据和私有试卷图片由 Supabase 托管。

## 功能

- 总成绩与语文、数学、英语、生物、化学、物理趋势
- 分数/得分率和年级排名双图联动
- 综合考试与单科测验、考试时间轴和详情
- 多张试卷/答题卡图片及多条个人心得
- 两人共同编辑、乐观锁冲突提示和修改记录
- 默认双方可见，也可将记录设为仅自己可见
- 30 天回收站与包含图片的数据导出

AI、OCR、通知、公开注册和 PWA 不在当前版本中。

## 技术架构

- React、TypeScript、Vite 和 HashRouter
- Supabase Auth、PostgreSQL（RLS）、Private Storage 和 Cron
- GitHub Actions 构建并发布到 GitHub Pages

浏览器中只有 Supabase URL 和 publishable key；访问控制由数据库和 Storage 的 RLS 执行。`service_role`/secret key 只允许管理员在本机初始化或维护账号时使用。

## 本地运行

需要 Node.js 22.12+ LTS（或兼容的更新 LTS）和 npm。连接托管 Supabase 项目时不需要 Docker。

```powershell
npm ci
Copy-Item .env.example .env.local
```

编辑 `.env.local`，至少填写：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
VITE_BASE_PATH=/
```

然后运行：

```powershell
npm run dev
```

提交前的本地检查与线上工作流一致：

```powershell
npm run typecheck
npm run test
npm run build
```

## 首次部署

1. 按 [部署指南](docs/deployment.md) 创建托管 Supabase 项目、应用迁移并初始化两个固定账号。
2. 在 GitHub 仓库中配置两个公开变量：`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。
3. 将 GitHub Pages 的发布源设为 **GitHub Actions**，推送 `main` 分支。
4. 按 [运维指南](docs/operations.md) 验证权限、定时清理和首次导出。

工作流会依次执行 `npm ci`、类型检查、测试、构建和 Pages 发布；任一步失败都不会替换现有站点。项目仓库和 `用户名.github.io` 仓库的基础路径会自动适配。

## 安全约束

- 不要提交 `.env.local`、真实口令、成绩、图片或任何 Supabase 管理密钥。
- 不要给 `SUPABASE_SERVICE_ROLE_KEY` 添加 `VITE_` 前缀；所有 `VITE_` 变量都会进入浏览器构建产物。
- 不要把试卷图片放进 GitHub 仓库；应用只将优化后的图片写入私有 Storage bucket。
- 关闭 Supabase 的公开注册。即使误建了第三个 Auth 用户，没有共享空间成员资格也必须被 RLS 拒绝。
- 正式数据库的结构变更只通过 `supabase/migrations` 提交和部署，避免远端结构与迁移历史漂移。

## 文档

- [部署与双账号初始化](docs/deployment.md)
- [安全、备份、清理和密码重置](docs/operations.md)
