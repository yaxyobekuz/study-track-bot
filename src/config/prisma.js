/**
 * FILIAL client'i — joriy filial kontekstiga qarab tanlanadigan PrismaClient.
 *
 * Bot ham serverdagi bilan bir xil naqshdan foydalanadi: import yo'li
 * o'zgarmaydi (`require("../config/prisma")`), lekin modul endi Proxy —
 * har murojaatda joriy filialning client'iga yo'naltiradi
 * (`config/branch.js` dagi AsyncLocalStorage).
 *
 * Natijada `src/services/*` dagi so'rovlar boshqa filialning ma'lumotini
 * qaytara olmaydi: ajratish so'rov shartida emas, ULANISH darajasida.
 *
 * ⚠️ Kontekstdan tashqarida murojaat XATO beradi. Xabar kelganda kontekst
 * `bot.handler.js` da (telegramId → filial), cron'da esa `forEachBranch`
 * ichida yoqiladi.
 */

const { getCurrentClient } = require("./branch");

const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === "then") return undefined;

      const client = getCurrentClient();
      const value = Reflect.get(client, prop);
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);

module.exports = prisma;
