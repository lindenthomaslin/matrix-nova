import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: authData, error: authError } = await adminClient.auth.getUser(token)
    if (authError || !authData.user) throw new Error('未登录或登录已过期')
    const { data: caller } = await adminClient.from('profiles').select('role,status,is_owner').eq('id', authData.user.id).single()
    if (caller?.role !== 'admin' || caller?.status !== 'active') {
      return Response.json({ error: '仅管理员可执行此操作' }, { status: 403, headers: corsHeaders })
    }

    const { action, user } = await req.json()
    if (!user) throw new Error('缺少用户信息')
    if (user.id === authData.user.id && (action === 'delete' || user.status === 'banned' || user.role === 'user')) {
      throw new Error('不能删除、封禁或降级当前管理员账号')
    }

    // The site owner is permanently protected. This runs before any profile or
    // Auth mutation, including password resets, so another admin cannot bypass
    // the database safeguard through the service role.
    if (user.id) {
      const { data: target, error: targetError } = await adminClient
        .from('profiles').select('is_owner').eq('id', user.id).maybeSingle()
      if (targetError) throw targetError
      if (target?.is_owner && !caller?.is_owner) {
        return Response.json({ error: '站点所有者账号受永久保护，其他管理员无法编辑、封禁、删除或重置密码。' }, { status: 403, headers: corsHeaders })
      }
    }

    if (action === 'create') {
      const { data, error } = await adminClient.auth.admin.createUser({
        email: user.email, password: user.password, email_confirm: true,
        user_metadata: { nickname: user.nickname },
      })
      if (error) throw error
      const { error: profileError } = await adminClient.from('profiles').update({ nickname: user.nickname, role: user.role, status: user.status }).eq('id', data.user.id)
      if (profileError) throw profileError
      return Response.json({ user: data.user }, { headers: corsHeaders })
    }
    if (action === 'update') {
      const changes: Record<string, string> = {}
      if (user.nickname !== undefined) changes.nickname = user.nickname
      if (user.role !== undefined) changes.role = user.role
      if (user.status !== undefined) changes.status = user.status
      const { error } = await adminClient.from('profiles').update(changes).eq('id', user.id)
      if (error) throw error
      if (user.nickname !== undefined || user.password) {
        const authChanges: { password?: string; user_metadata?: { nickname: string } } = {}
        if (user.password) authChanges.password = user.password
        if (user.nickname !== undefined) authChanges.user_metadata = { nickname: user.nickname }
        const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(user.id, authChanges)
        if (authUpdateError) throw authUpdateError
      }
      return Response.json({ ok: true }, { headers: corsHeaders })
    }
    if (action === 'delete') {
      const { error } = await adminClient.auth.admin.deleteUser(user.id)
      if (error) throw error
      return Response.json({ ok: true }, { headers: corsHeaders })
    }
    throw new Error('未知操作')
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '操作失败' }, { status: 400, headers: corsHeaders })
  }
})

// TODO: 后续新增 send-notification Edge Function，在服务端读取 system_config 并接入邮件服务商。
