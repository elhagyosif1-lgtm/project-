import { GoogleGenAI } from '@google/genai';
import { isOwner } from './auth.js';

const DEFAULT_SKILLS = 'الكتابة بالعربية، اختراع الألعاب، تصميم الأوفرلاي للبث المباشر، تصميم المواقع والإعلانات، بناء نسخة ذكاء اصطناعي بسيطة للمحادثة';

const SYSTEM = `أنت مساعد تخطيط دخل للمالك. اكتب بالعربية المصرية الواضحة.
مهمتك: اقترح أعمالاً صغيرة قابلة للتنفيذ من المهارات المذكورة، مرتبة من الأسرع دخلاً إلى الأبطأ.
النتيجة يجب أن تكون JSON فقط، بصيغة مصفوفة من 5 عناصر، بدون Markdown، بدون شرح إضافي.
كل عنصر يجب أن يكون كائن JSON يحتوي فقط على الحقول التالية:
- title
- idea
- platform
- price
- guarantee
- evidence
- first_24h
- risk
- confidence

حقل evidence نفسه كائن JSON به:
- found
- source
- summary

قاعدة صارمة: لا تخترع شركات أو أرقاماً أو أرباحاً. إن لم تتحقق من شركة بمصدر، قل ذلك صراحة. ميّز المؤكد من المحتمل. لا تقترح أي عمل يطلب دفع رسوم مقدمة من المستقبَل، ولا أي مخطط تسويق هرمي، ولا أي شيء يخالف شروط المنصات. لا تدّع أن أي شيء نُفّذ بالخلفية.`;

function parseIdeas(rawText) {
  if (!rawText) return [];

  const cleaned = String(rawText)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.reply)) return parsed.reply;
    return [];
  } catch {
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'الطريقة غير مسموحة' });
  if (!isOwner(req)) return res.status(401).json({ error: 'سجّل الدخول أولاً' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'أضف GEMINI_API_KEY في إعدادات Vercel.' });

  const skills = String(req.body?.skills || DEFAULT_SKILLS).trim().slice(0, 1500);
  const goal = String(req.body?.goal || 'أعطني أفضل 5 فرص سريعة الدخل، مع خطة أول يوم.').trim().slice(0, 1500);

  const prompt = `مهاراتي:\n${skills}\n\nهدفي:\n${goal}\n\nأعطني أفضل 5 فرص سريعة الدخل، مرتبة من الأسرع دخلاً إلى الأبطأ.`;

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

    const reply = parseIdeas(result?.text || '');

    return res.status(200).json({
      reply,
      model,
      grounding: result?.candidates?.[0]?.groundingMetadata || null,
    });
  } catch (e) {
    console.error('Ideas request failed:', e?.message || e);
    return res.status(502).json({ error: 'تعذر الاتصال بـ Gemini. راجع المفتاح وحدود الاستخدام.' });
  }
}
