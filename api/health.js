import { isOwner } from './auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'الطريقة غير مسموحة' });
  if (req.query?.task && req.query.task !== 'scheduled-check') return res.status(400).json({ error: 'مهمة غير معروفة' });

  // A minimal public liveness response lets the landing page finish its health check
  // without exposing owner configuration or requiring an authenticated session.
  if (!req.query?.task && !isOwner(req)) {
    return res.status(200).json({ ok: true, service: 'صيّاد الفرص', authenticated: false });
  }

  const configured = {
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    ownerGate: Boolean(process.env.OWNER_ACCESS_CODE && process.env.SESSION_SECRET?.length >= 32),
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  };

  return res.status(200).json({
    ok: true,
    service: 'صيّاد الفرص',
    configured,
    scheduledTask: req.query?.task
      ? { accepted: true, note: 'فحص جدولة تجريبي فقط؛ لا يوجد حتى الآن جامع فرص أو قاعدة بيانات أو تنبيهات.' }
      : undefined,
  });
}
