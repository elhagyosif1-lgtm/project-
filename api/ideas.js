import { GoogleGenAI } from '@google/genai';
import { isOwner } from './auth.js';

const DEFAULT_SKILLS = 'الكتابة بالعربية، اختراع الألعاب، تصميم الأوفرلاي للبث المباشر، تصميم المواقع والإعلانات، بناء نسخة ذكاء اصطناعي بسيطة للمحادثة';

const SYSTEM = `أنت مساعد تخطيط دخل للمالك. اكتب بالعربية المصرية الواضحة.
مهمتك: اقترح أعمالاً صغيرة قابلة للتنفيذ من المهارات المذكورة، مرتبة من الأسرع دخلاً إلى الأبطأ.
لكل فرصة اذكر بهذا الترتيب:
- الفكرة وما ستبيعه بالضبط
- المنصة أو الجهة (مثل مستقل، خمسات، أو منصات الألعاب والمتاجر) وهل هي معروفة وعامة
- السعر التقريبي وطريقة الدفع والضمان إن وُجد
- هل وجدت دليلاً حديثاً على أن هذا النوع من الط��ب موجود فعلاً، وما هو المصدر
- أول خطوة عملية خلال 24 ساعة
- المخاطر
قاعدة صارمة: لا تخترع شركات أو أرقاماً أو أرباحاً. إن لم تتحقق من شركة بمصدر، قل ذلك صراحة. ميّز المؤكد من المحتمل. لا تقترح أي عمل يطلب دفع رسوم مقدمة من المستقبَل، ولا أي مخطط تسويق هرمي، ولا أي شيء يخالف شروط المنصات. لا تدّع أن أي شيء نُفّذ بالخلفية.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'الطريقة غير مسموحة' });
  if (!isOwner(req)) return res.status(401).json({ error: 'سجّل الدخول أولاً' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'أضف GEMINI_API_KEY في إعدادات Vercel.' });

  const skills = String(req.body?.skills || DEFAULT_SKILLS).trim().slice(0, 1500);
  const goal = String(req.body?.goal || 'أعطني أفضل 5 فرص سريعة الدخل، مع خطة أول يوم.').trim().slice(0, 1500);

  const prompt = `مهاراتي: ${skills}\nهدفي: ${goal}`;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const result = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM,
        tools: [{ googleSearch: {} }],
        temperature: 0.4,
      },
    });
    return res.status(200).json({
      reply: result.text || 'لم يصل رد نصي من Gemini.',
      model,
      grounding: result.candidates?.[0]?.groundingMetadata || null,
    });
  } catch (e) {
    console.error('Ideas request failed:', e?.message || e);
    return res.status(502).json({ error: 'تعذر الاتصال بـ Gemini. راجع المفتاح وحدود الاستخدام.' });
  }
}
