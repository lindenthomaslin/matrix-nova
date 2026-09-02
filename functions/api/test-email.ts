export const onRequestPost = async ({ request }: { request: Request }) => {
  const body = await request.json<{ recipient?: string }>().catch(() => ({}))
  if (!body.recipient) return Response.json({ message: '请提供收件地址' }, { status: 400 })
  return Response.json({ message: '测试邮件发送服务尚未绑定 SMTP 发信函数，请先部署邮件发送 Edge Function。' }, { status: 501 })
}
