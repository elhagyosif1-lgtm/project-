import { GoogleGenAI } from '@google/genai';
import { isOwner } from './auth.js';

const SYSTEM = 'أنت صيّاد الفرص، مساعد تنفيذي شخصي لصاحب الموقع. تحدث بالعربية المصرية الواضحة افتراضياً. ابحث عن فرص دخل حقيقية تناسب مصر والعمل من الهاتف، قيّم المصداقية وشروط الدفع والمهارات والمخاطر، وجهّز رسائل التقديم. لا تخترع فرصاً أو أرباحاً أو نتائج تنفيذ. اذكر المصدر والتاريخ وميّز المؤكد من المحتمل. لا تدّع أنك تعمل بالخلفية أو أرسلت طلباً ما لم يحدث ذلك فعلاً. لا تطلب كلمات مرور أو مفاتيح API. لا تنفذ مدفوعات أو ترسل طلبات نهائية دون موافقة صريحة، ولا تتجاوز شروط المواقع.';

async function generate(messages) {
  const key = process.env.GEMINI_API_KEY.trim();
  if (key.startsWith('sk-or-')) {
    const model = process.env.OPENROUTER_MODEL || 'openrouter/auto';
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://sayyad-gemini.vercel.app',
        'X-Title': 'صيّاد الفرص',
      },
      body: JSON.stringify({ model, messages, temperature: 0.35 }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `OpenRouter HTTP ${response.status}`);
    return { reply: data.choices?.[0]?.message?.content || 'لم يصل رد نصي من النموذج.', model, grounding: null };
  }

  const ai = new GoogleGenAI({ apiKey: key });
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const contents = messages.filter(x => ['user', 'assistant'].includes(x.role))
    .map(x => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(x.content || '').slice(0, 6000) }] }));
  const result = await ai.models.generateContent({
    model,
    contents,
    config: { systemInstruction: SYSTEM, tools: [{ googleSearch: {} }], temperature: 0.35 },
  });
  return { reply: result.text || 'لم يصل رد نصي من Gemini.', model, grounding: result.candidates?.[0]?.groundingMetadata || null };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'الطريقة غير مسموحة' });
  if (!isOwner(req)) return res.status(401).json({ error: 'سجّل الدخول أولاً' });
  if (!process.env.GEMINI_API_KEY?.trim()) return res.status(503).json({ error: 'مفتاح الذكاء الاصطناعي غير مضبوط في إعدادات Vercel؛ لا تضعه في واجهة الموقع.' });

  const message = String(req.body?.message || '').trim();
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-12) : [];
  if (!message || message.length > 12000) return res.status(400).json({ error: 'اكتب رسالة لا تتجاوز 12000 حرف.' });

  try {
    const messages = [
      { role: 'system', content: SYSTEM },
      ...history.filter(x => x && ['user', 'assistant', 'model'].includes(x.role))
        .map(x => ({ role: x.role === 'model' ? 'assistant' : x.role, content: String(x.text || x.content || '').slice(0, 6000) })),
      { role: 'user', content: message },
    ];
    const result = await generate(messages);
    return res.status(200).json(result);
  } catch (e) {
    console.error('AI chat request failed:', e?.message || e);
    return res.status(502).json({ error: 'تعذر الاتصال بمزوّد الذكاء الاصطناعي. تحقق من المفتاح والنموذج وحدود الاستخدام.' });
  }
}
