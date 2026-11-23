/**
 * XODIM O'Z OYLIGINI KO'RMAYDI (biznes qarori, 2026-11-23).
 *
 * Botdagi "💰 Oyligim" tugmasi va uning javobi VAQTINCHA yopiq — panellar
 * va server bilan AYNI qaror (`.claude/rules/finance.md` §15, serverda
 * `helpers/selfPayroll.helpers.js`).
 *
 * ⚠️ BOT SERVER API'SIDAN O'QIMAYDI — u bazaga o'zi qaraydi
 * (`staff.service.js`), ya'ni serverdagi darvoza bu yerga YETIB KELMAYDI.
 * Shu sababli bayroq botda ham bor; uni serverdagisi bilan BIRGA
 * o'zgartiring, aks holda oylik bir joyda yopiq, boshqasida ochiq qolardi.
 *
 * ⚠️ TUGMA YASHIRILISHI YETMAYDI: Telegram klaviaturasi MIJOZDA qoladi va
 * odam eski tugmani bosa oladi, shuning uchun handler ham tekshiradi
 * (`bot.handler.js#handleStaffPayroll`).
 *
 * ⚠️ JARIMA, DAVOMAT, TOPSHIRIQ VA DARSLAR OCHIQ QOLADI.
 */
module.exports = {
  /** `true` — tugma va oylik javobi avvalgidek ishlaydi. */
  SELF_PAYROLL_VISIBLE: false,
};
