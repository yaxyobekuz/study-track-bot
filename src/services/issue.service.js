/**
 * MUAMMO YUBORISH — botdagi "muammo" oqimining ma'lumot qatlami.
 *
 * Oqim: KATEGORIYA tanlanadi (oddiy klaviatura, faqat faol kategoriyalar) →
 * matn yoziladi → `issues` ga qator tushadi. Ma'muriyat panelda ko'radi,
 * javob yozadi va javob botga qaytadi (serverdagi
 * `issueNotification.service.js`).
 *
 * ── QOIDALAR ─────────────────────────────────────────────────────────
 *
 * ⚠️ BU SERVICE YOZADI — botdagi yagona shunday service va bu `staff.
 * service.js` ustidagi "faqat o'qish" qoidasiga QARSHI EMAS. O'sha qoida
 * SERVERDAGI biznes qoidasini botda takrorlamaslik haqida: davomat
 * belgilash, topshiriq yakunlash, oylik hisoblash — har birida serverda
 * qoida bor va botdagi nusxa ikkita haqiqat manbasini yaratardi. Muammo
 * yaratishda serverda qoida YO'Q: server muammo yaratmaydi, faqat ko'rib
 * chiqadi (`status`, `reply`). Ikki tomon bir ustunga yozmaydi.
 *
 * ⚠️ KATEGORIYALAR BOTDA YARATILMAYDI. Ularni admin panel sozlaydi, bot
 * esa faqat FAOL bo'lganlarini ko'rsatadi: o'chirilgan kategoriya tugmasi
 * darhol yo'qoladi, lekin eski muammolar o'z kategoriyasini saqlab qoladi
 * (panelda yumshoq o'chirish).
 *
 * ⚠️ HOLAT VA JAVOB USTUNLARIGA TEGILMAYDI. `INSERT` da ular berilmaydi —
 * `status` bazadagi `@default(new)` dan keladi. Bo'lmasa ma'muriyatning
 * javobi ustiga yozilib ketardi.
 */

const prisma = require("../config/prisma");

/**
 * MATN CHEGARASI.
 *
 * Telegram bitta xabarda 4096 belgi beradi, lekin bu yerda chegara
 * ATAYLAB kichikroq: panelda ro'yxat ko'rinishi va javob xabariga
 * qaytariladigan qisqartma (`issueNotification.service.js`) o'qilishi
 * kerak. Uzun matn kesilmaydi — foydalanuvchiga qayta yozish taklif
 * qilinadi, aks holda u yozganining yarmi jimgina yo'qolardi.
 */
const BODY_MAX = 1500;

/** Juda qisqa matn ma'nosiz ("salom", "."). */
const BODY_MIN = 10;

/** Muallif turlari — `auth.service.js#LINK_KIND` bilan ayni qiymatlar. */
const AUTHOR_KIND = { STUDENT: "student", STAFF: "staff" };

/**
 * KLAVIATURA UCHUN FAOL KATEGORIYALAR.
 *
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
const getActiveCategories = async () => {
  try {
    return await prisma.issueCategory.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error("Issue categories error:", error);
    return [];
  }
};

/**
 * TUGMA MATNI → KATEGORIYA.
 *
 * ⚠️ NOM BO'YICHA IZLANADI, ID bo'yicha emas: Telegram'dagi oddiy
 * klaviatura tugmasi — matnli xabar, ya'ni bizga faqat nom qaytadi.
 * Qidiruv FAQAT FAOL kategoriyalar orasidan: odam klaviaturani ochiq
 * qoldirib, kategoriya o'chirilgandan keyin tugmani bosishi mumkin va
 * o'sha holda muammo o'chirilgan kategoriyaga tushib qolmasligi kerak.
 *
 * @param {string} name - tugma matni
 * @returns {Promise<{id: string, name: string}|null>}
 */
const findActiveCategoryByName = async (name) => {
  if (!name) return null;

  try {
    const categories = await getActiveCategories();
    const needle = name.trim().toLowerCase();
    return categories.find((c) => c.name.trim().toLowerCase() === needle) || null;
  } catch (error) {
    console.error("Issue category lookup error:", error);
    return null;
  }
};

/**
 * MATNNI TEKSHIRADI.
 *
 * @param {string} body
 * @returns {{ok: true, body: string}|{ok: false, error: "TOO_SHORT"|"TOO_LONG"}}
 */
const validateBody = (body) => {
  const text = (body || "").trim();
  if (text.length < BODY_MIN) return { ok: false, error: "TOO_SHORT" };
  if (text.length > BODY_MAX) return { ok: false, error: "TOO_LONG" };
  return { ok: true, body: text };
};

/**
 * MUAMMONI SAQLAYDI.
 *
 * @param {object} input
 * @param {object} input.tgUser - `getTgUser()` natijasi
 * @param {string} input.categoryId
 * @param {string} input.body - tekshirilgan matn
 * @returns {Promise<object|null>} yaratilgan qator yoki `null` (xato)
 */
const createIssue = async ({ tgUser, categoryId, body }) => {
  try {
    return await prisma.issue.create({
      data: {
        categoryId,
        // ⚠️ `person.id` — BOG'LANGAN ODAM. Ota-ona oqimida bu O'QUVCHI
        // (botdan foydalanuvchi uning ota-onasi): tizimda ota-ona
        // foydalanuvchi emas, shuning uchun murojaat o'quvchi nomidan
        // qayd etiladi va `authorKind` farqni ko'rsatadi.
        userId: tgUser.person.id,
        authorKind: tgUser.kind,
        body,
        telegramId: String(tgUser.telegramId),
        // Javob AYNAN SHU chatga qaytadi — keyin bog'lanish uzilsa ham.
        chatId: String(tgUser.chatId || tgUser.telegramId),
      },
      include: { category: { select: { name: true } } },
    });
  } catch (error) {
    console.error("Issue create error:", error);
    return null;
  }
};

module.exports = {
  BODY_MAX,
  BODY_MIN,
  AUTHOR_KIND,
  getActiveCategories,
  findActiveCategoryByName,
  validateBody,
  createIssue,
};
