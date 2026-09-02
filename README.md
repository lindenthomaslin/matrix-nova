# HackFlow 2026 黑客松报名平台

完整的部署、上传、数据库迁移、函数发布和故障排查说明见 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)。

Vue 3 + TypeScript + Tailwind CSS + Supabase 构建的可部署报名平台，前端适配 Cloudflare Pages。

## 已实现

- `/` 赛事首页
- `/register` 注册账号并提交 / 更新报名
- `/login` 登录与封禁账号拦截
- `/dashboard` 选手个人控制台（仅自己的资料）
- `/developer` 管理员后台（报名、用户、SMTP 配置）
- `/403` 普通用户访问管理员后台时的拒绝页面
- 深浅色模式与移动端适配
- 科幻白蓝毛玻璃界面、渐入/漂浮动画
- 登录与注册左右布局；管理员可在“系统配置”随时更换左侧展示图
- Supabase Auth、三张业务表、RLS、用户管理 Edge Function
- 报名搜索、筛选、状态更新、编辑、删除、CSV 导出与统计

## 1. Supabase 初始化

1. 新建 Supabase 项目。
2. 打开 SQL Editor，完整执行 `supabase/migrations/202608280001_init.sql`。
3. 继续执行 `supabase/migrations/202608280002_branding.sql`，增加认证页品牌图字段与公开只读 RPC。
4. 在 Authentication → URL Configuration 中添加本地及线上站点 URL。
5. 部署管理员用户函数：

   ```bash
   npx supabase login
   npx supabase functions deploy admin-users --project-ref nxliebelnhfibofftwbx
   ```

   `supabase/config.toml` 已包含线上站点 URL 与回调白名单；如需从本地同步 Auth 配置，可执行 `npx supabase config push --project-ref nxliebelnhfibofftwbx --workdir supabase`。

6. 在网站注册第一个账号后，在 SQL Editor 执行（替换邮箱）：

   ```sql
   update public.profiles set role = 'admin' where email = 'your-admin@example.com';
   ```

RLS 是最终权限边界：封禁账号无法读取或修改业务数据；普通用户只能访问自己的 profile 与报名；active 管理员可管理全部数据。登录页还会在认证成功后立即读取账号状态，被封禁账号会自动退出。

## 2. 本地环境

复制 `.env.example` 为 `.env.local`，填入 Supabase Project URL 与 anon key：

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

然后运行：

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 3. Cloudflare Pages

- 构建命令：`npm run build`
- 输出目录：`dist`
- 环境变量：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
- `public/_redirects` 已配置单页应用路由回退。
- 当前线上地址：[https://matrix-nova.com](https://matrix-nova.com/)
- Cloudflare Pages 默认地址：[https://hackflow-2026.pages.dev](https://hackflow-2026.pages.dev/)

## 邮件接口预留

`system_config` 仅保存 SMTP 服务器、端口、发件邮箱、账号、密码与通知模板，且只有管理员能访问。当前没有真实发送逻辑。`supabase/functions/admin-users/index.ts` 末尾保留了下一步实现 `send-notification` Edge Function 的位置。

正式使用时建议把 SMTP 密码迁移到 Supabase Vault 或 Edge Function Secret，不在普通数据库字段中长期保存。
