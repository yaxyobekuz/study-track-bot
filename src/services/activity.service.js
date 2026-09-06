/**
 * FAOLLIK — bot tomonidagi yozuv.
 *
 * Serverdagi `services/activity.service.js` ning bot ko'zgusi. Ikkalasi
 * AYNI jadvalga (`activity_events`) yozadi va admin panelidagi "Faollik"
 * bo'limi ularni birga o'qiydi.
 *
 * ── NIMA UCHUN KERAK ─────────────────────────────────────────────────
 *
 * "Bu sinfning 25 ta ota-onasidan 20 tasi bugun botdan foydalandi"
 * degan savolga faqat BOT javob bera oladi — server ota-onaning tugma
 * bosganini ko'rmaydi. Ilgari `TgUser.lastActivity` faqat hisob
 * BOG'LANGAN lahzada bir marta yozilar edi, ya'ni ustun amalda "qachon
 * bog'landi" degani bo'lib qolgan edi va uni "bugun faol" uchun
 * ishlatib bo'lmasdi.
 *
 * ── IKKI YOZUV, IKKI SAVOL ───────────────────────────────────────────
 *
 *   `ActivityEvent`      — TARIX ("shu oy nechta kun kirdi")
 *   `TgUser.lastActivity` — JORIY HOLAT ("oxirgi marta qachon ko'rindi")
 *
 * Ikkinchisini hodisalardan har safar hisoblash mumkin edi, lekin u
 * ro'yxatdagi HAR QATOR uchun kerak bo'ladi va `MAX(occurred_at)` bilan
 * yig'ish o'sha ro'yxatni sekinlashtirardi.
 *
 * ── QOIDALAR ─────────────────────────────────────────────────────────
 *
 * ⚠️ FILIAL KONTEKSTI SHART. `activity_events` FILIAL jadvali, shuning
 * uchun yozuv faqat `runWithBranch` ichida ishlaydi. Bog'lanmagan
 * (`/start` bosgan, lekin hali login qilmagan) foydalanuvchida filial
 * YO'Q va uning harakati YOZILMAYDI — bu ataylab: uni qaysi filialga
 * yozishni hech kim bila olmaydi.
 *
 * ⚠️ XATO BOTNI TO'XTATMAYDI. Har yozuv `.catch()` bilan o'ralgan:
 * faollik — kuzatuv, xizmat emas. Uning xatosi ota-onaning bahoni
 * ko'rishiga to'sqinlik qilmasligi kerak.
 *
 * ⚠️ CHIQUVCHI HODISALAR `bot.out.` PREFIKSI bilan. Ular BIZ yuborgan
 * xabar, foydalanuvchi harakati emas — hisobotda faol foydalanuvchi
 * sanog'iga kirmaydi (aks holda kechki hisobot yuborilgan har bir
 * ota-ona "faol" bo'lib chiqardi).
 */

const { ObjectId } = require("bson");
const { getBranch, getCurrentClient } = require("../config/branch");

/**
 * KUN KOORDINATASI — Toshkent kuni, UTC yarim tunida.
 *
 * ⚠️ Bu FORMATLOVCHI EMAS, koordinata: `dates.md` dagi "yagona
 * formatlovchi" qoidasi ekranga chiqadigan MATNGA tegishli, bu esa
 * `@db.Date` ustuniga yoziladigan qiymat. Serverdagi
 * `month.helpers.js#currentDayDate` bilan aynan bir xil hisob.
 *
 * @returns {Date}
 */
function tashkentDay() {
  const now = new Date();
  const tashkent = new Date(
    now.getTime() + now.getTimezoneOffset() * 60000 + 5 * 3600000,
  );
  return new Date(
    Date.UTC(tashkent.getFullYear(), tashkent.getMonth(), tashkent.getDate()),
  );
}

/**
 * Bitta hodisani yozadi. Xatoni yutadi.
 *
 * @param {object} input
 * @param {string} input.telegramId
 * @param {string} [input.studentId]
 * @param {string} input.action - "bot.start", "bot.grades", ...
 * @param {object} [input.meta]
 * @returns {Promise<void>}
 */
async function record({ telegramId, studentId, action, meta }) {
  if (!telegramId) return;

  // Filial konteksti bo'lmasa yozib bo'lmaydi — bog'lanmagan
  // foydalanuvchi uchun bu NORMAL holat, jim o'tkazamiz
  if (!getBranch()) return;

  const prisma = getCurrentClient();
  const id = new ObjectId().toHexString();
  const day = tashkentDay();

  await Promise.all([
    prisma.activityEvent.create({
      data: {
        id,
        channel: "bot",
        action: String(action).slice(0, 48),
        actorKey: `tg:${telegramId}`,
        telegramId: String(telegramId),
        studentId: studentId ?? null,
        day,
        meta: meta ?? undefined,
      },
    }),

    // ⚠️ CHIQUVCHI hodisada `lastActivity` YANGILANMAYDI: biz yuborgan
    // xabar foydalanuvchining "ko'ringani" emas. Aks holda hisobot
    // yuborilgan har bir ota-ona "bugun faol" bo'lib qolardi.
    action.startsWith("bot.out.")
      ? Promise.resolve()
      : prisma.tgUser.updateMany({
          where: { telegramId: String(telegramId) },
          data: { lastActivity: new Date() },
        }),
  ]);
}

/**
 * "Yozib qo'y va unut" — bot oqimida ishlatiladigan shakl.
 *
 * @param {object} input - `record` bilan bir xil
 * @returns {void}
 */
function track(input) {
  record(input).catch((error) => {
    console.error("⚠️ Faollik yozilmadi:", error.message);
  });
}

module.exports = { track, record, tashkentDay };
