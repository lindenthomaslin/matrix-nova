# Matrix Nova 部署与上传说明

本文记录 Matrix Nova 黑客松平台的发布方式，方便后续自己维护、换电脑或交接给其他开发者。

## 一、系统组成

项目由三部分组成：

| 部分 | 用途 | 发布位置 |
| --- | --- | --- |
| Vue 3 + Tailwind 前端 | 首页、注册登录、选手控制台、管理员后台 | Cloudflare Pages |
| Supabase Database | 用户资料、报名、队伍、签到、系统配置、访问统计 | Supabase 项目 `nxliebelnhfibofftwbx` |
| Supabase Auth / Edge Functions | 邮箱验证、登录状态、管理员用户操作、审核通知等接口 | Supabase Auth 与 Functions |

线上地址：<https://matrix-nova.com/>

## 二、前端如何上传到 Cloudflare Pages

前端不是把源代码直接放到网页上，而是先生成生产文件：

```bash
npm install
npm run build
```

`npm run build` 会执行 TypeScript 检查并由 Vite 生成 `dist/`。Cloudflare Pages 只需要上传这个目录。

手动发布：

```bash
npx wrangler pages deploy dist \
  --project-name hackflow-2026 \
  --commit-message "describe this release"
```

项目中的 `wrangler.jsonc` 已配置：

- Pages 项目：`hackflow-2026`
- 构建输出目录：`dist`
- 单页路由回退：`public/_redirects`

也可以在 Cloudflare Pages 控制台绑定 Git 仓库，让每次推送自动执行 `npm run build` 并发布 `dist`。当前项目采用 Wrangler 手动发布，因此发布前应先通过 `npm run build`。

## 三、前端环境变量

在本地使用 `.env.local`（不要提交到 Git）：

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_TURNSTILE_SITE_KEY=YOUR_TURNSTILE_SITE_KEY
```

同样的变量要在 Cloudflare Pages 的 **Settings → Environment variables** 中配置，然后重新部署。`VITE_*` 变量会被编译进浏览器，适合放 Supabase anon key 和 Turnstile site key；Supabase service-role key、SMTP 授权码、Supabase PAT 绝不能放在这里，也不能写入前端代码。

## 四、数据库如何上传和更新

数据库结构以 `supabase/migrations/` 下的 SQL 文件为准，文件名按时间顺序执行。当前包含：

- 基础表：`profiles`、`hackathon_register`、`system_config`
- 队伍、签到、论坛/公共聊天、团队介绍内容
- 首页与站点内容配置
- 访问统计表 `site_visit_events` 和管理员统计函数
- 站点所有者保护与唯一所有者约束

当前最新迁移编号为 `202608290017_set_cosmic_home_hero.sql`。

连接正确项目后，执行：

```bash
npx supabase login
npx supabase db push --project-ref nxliebelnhfibofftwbx
```

命令会将本地尚未执行的 migration 按顺序应用到 Supabase，不会重复执行已经记录的迁移。首次接手时不要只执行最后一个 SQL，应保留并按顺序执行全部 migration。

### 数据库权限

RLS 是最终权限边界：

- 普通用户只能读写自己的 profile 和报名资料；
- 封禁用户无法继续访问业务数据；
- active 管理员可以处理报名、用户、队伍、签到和系统设置；
- `linruichengchina@gmail.com` 是唯一站点所有者，数据库触发器会阻止删除、封禁、降级、换邮箱或通过服务端绕过保护；
- 访问统计允许前端写入匿名事件，但只有管理员统计函数可读。

## 五、Supabase Edge Functions 如何上传

函数源码位于 `supabase/functions/`。例如管理员用户管理函数：

```bash
npx supabase functions deploy admin-users \
  --project-ref nxliebelnhfibofftwbx
```

当前需要部署的函数包括：

```bash
npx supabase functions deploy admin-users --project-ref nxliebelnhfibofftwbx
npx supabase functions deploy send-notification --project-ref nxliebelnhfibofftwbx
npx supabase functions deploy test-email --project-ref nxliebelnhfibofftwbx
npx supabase functions deploy update-auth-email-template --project-ref nxliebelnhfibofftwbx
```

Edge Function 运行环境会自动提供 `SUPABASE_URL`，但使用 service role 的函数还需要在 Supabase **Project Settings → Edge Functions → Secrets** 中配置 `SUPABASE_SERVICE_ROLE_KEY`。该 key 只能留在服务端函数中。

## 六、图片和站点内容的上传方式

有两种图片来源：

1. **前端默认静态资源**：放进 `public/images/`，构建时随 `dist` 一起上传。例如首页默认科幻背景：
   `public/images/matrix-nova-hero-v2.png`，页面路径为 `/images/matrix-nova-hero-v2.png`。
2. **后台上传资源**：后台的图片上传会写入 Supabase Storage 的公开 bucket `site-assets`，然后把公开 URL 保存到 `system_config` 或 `site_team_members`。这样更换图片不需要重新构建前端。

后台上传图片的限制是图片格式和大小校验（当前不超过 5MB）。上传成功后还要点击“保存当前配置”，前台才会读取新 URL。

## 七、访问统计和实时数据

前端每次路由访问会写入 `site_visit_events`，只保存匿名访客标识、页面路径和时间，不保存 IP 或浏览器指纹。管理员控制面板通过 `get_admin_analytics()` 读取：

- 今日独立访客
- 今日浏览量
- 过去 5 分钟在线访客
- 注册与报名数量
- 近 7 天趋势
- 热门页面

控制面板还订阅 Supabase Realtime 的新访问事件，因此新访客到达后会自动刷新。

## 八、推荐发布顺序

涉及数据库或函数时，按以下顺序操作：

```bash
# 1. 安装依赖并检查前端
npm install
npm run build

# 2. 先更新数据库结构和 RLS
npx supabase db push --project-ref nxliebelnhfibofftwbx

# 3. 发布发生变化的 Edge Functions
npx supabase functions deploy admin-users --project-ref nxliebelnhfibofftwbx

# 4. 最后发布前端
npx wrangler pages deploy dist --project-name hackflow-2026
```

只改样式或页面时，可以跳过数据库和函数步骤；只改 SQL 时，不需要重新上传前端。

## 九、安全与故障排查

- 不要把 Supabase PAT、service role key、SMTP 密码提交到仓库或发到聊天窗口。
- 如果前端显示“Supabase 未配置”，先检查 Cloudflare Pages 环境变量并重新部署。
- 如果出现“找不到字段”，说明远端数据库还没执行对应 migration，重新运行 `supabase db push`。
- 如果 Edge Function 返回 4xx/5xx，先在 Supabase Functions 日志中查看函数错误，再确认函数 secret 和 JWT 配置。
- 如果图片上传后不显示，检查 Storage bucket 的公开读取策略、返回的 URL，以及后台是否点击了保存。
- 如果需要回滚，优先修复代码并发布新的前端版本；数据库不要删除已执行的 migration。结构修复应新增一个更晚编号的 migration。

## 十、常用本地命令

```bash
npm run dev       # 本地开发：http://localhost:5173
npm run build     # 类型检查 + 生产构建
npm run preview   # 预览 dist 构建结果
```
