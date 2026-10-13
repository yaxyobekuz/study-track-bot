/**
 * GURUHLAR REYESTRI — "bot qaysi guruhlarda bor va qayerda admin".
 *
 * Admin paneldagi "Muammolar → Bot sozlamalari" tabi aynan shu jadvalni
 * ko'rsatadi, bu service esa uni to'ldiradi.
 *
 * ── NIMA UCHUN REYESTR KERAK ─────────────────────────────────────────
 *
 * ⚠️ Telegram Bot API'da "men qaysi guruhlarda adminman" degan savolga
 * javob beradigan metod YO'Q. `getChats` faqat MTProto'da, ya'ni bot
 * emas, ODAM nomidan ulanishda mavjud. Bot faqat O'ZIGA kelgan
 * hodisadan biladi, shuning uchun ro'yxatni biz to'playmiz:
 *
 *   my_chat_member   → botning holati o'zgardi (asosiy manba)
 *   guruhdagi xabar  → zaxira (hodisa o'tkazib yuborilgan bo'lsa)
 *
 * ⚠️ O'TMISHGA QARAMAYDI. Bu kod joylashtirilishidan OLDIN bot a'zo
 * bo'lgan guruh ro'yxatga O'ZI tushmaydi: Telegram o'tgan hodisalarni
 * qayta yubormaydi. Bunday guruh ro'yxatga tushishi uchun unda biror
 * harakat kerak — botning huquqi o'zgarishi yoki oddiy xabar. Shu
 * sababli zaxira yo'l (`touchFromMessage`) bor: aksariyat guruhda
 * kunda xabar bo'ladi, ya'ni ro'yxat o'zi to'lib boradi.
 *
 * ── PLATFORMA, FILIAL EMAS ───────────────────────────────────────────
 *
 * ⚠️ `platformPrisma` ishlatiladi, `config/prisma.js` EMAS. Sabab:
 * `my_chat_member` kelganda FILIAL KONTEKSTI YO'Q — botni guruhga
 * qo'shgan odam ro'yxatdan o'tmagan bo'lishi mumkin, ya'ni filialni
 * aniqlaydigan ishonchli signal yo'q. Guruhni filial bo'yicha bo'lishga
 * urinish "qaysi filial ko'radi" degan savolni jim va noto'g'ri hal
 * qilardi.
 *
 * ── BOT NIMAGA TEGMAYDI ──────────────────────────────────────────────
 *
 * ⚠️ `isOfficial` va uning hamrohlari (`officialBy`, `officialAt`,
 * `officialBranch`) — ADMIN PANELNING maydonlari. Bot ularni hech qachon
 * yozmaydi: `upsert` ning `update` bloki faqat Telegram'dan kelgan
 * maydonlarga tegadi. Aks holda guruh nomi o'zgargan paytda "rasmiy"
 * belgisi jimgina o'chib ketardi.
 */

const { platformPrisma } = require("../config/branch");

/**
 * Reyestrga tushadigan chat turlari.
 *
 * ⚠️ `private` ATAYLAB YO'Q: shaxsiy chat — bu bog'lanish
 * (`TgUser` / `TelegramDirectory`), guruh emas. Uni bu jadvalga yozish
 * reyestrni har bir foydalanuvchi bilan to'ldirib yuborardi.
 */
const GROUP_TYPES = new Set(["group", "supergroup", "channel"]);

/** Telegram'ning `ChatMember.status` qiymati — "bot hali ichidami". */
const PRESENT_STATUSES = new Set(["administrator", "member", "restricted"]);

/** @param {string} status */
const isPresent = (status) => PRESENT_STATUSES.has(status);

/**
 * Admin huquqlarini `ChatMember` dan oladi.
 *
 * ⚠️ Huquqlar FAQAT `administrator` da ma'noli: oddiy a'zoda Telegram bu
 * maydonlarni bermaydi va `undefined` ni `false` deb yozish to'g'ri —
 * "huquqi bor" deb ko'rsatib qo'ymaslik kerak.
 */
const readRights = (member) => ({
  canPostMessages: Boolean(member?.can_post_messages),
  canInviteUsers: Boolean(member?.can_invite_users),
});

/**
 * `my_chat_member` hodisasini reyestrga yozadi.
 *
 * Bu hodisa bot guruhga qo'shilganda, admin qilinganda, huquqi
 * o'zgarganda va chiqarilganda keladi — ya'ni ro'yxatning asosiy manbasi.
 *
 * @param {object} update Telegram `ChatMemberUpdated`
 * @returns {Promise<object|null>} yozilgan qator yoki `null` (shaxsiy chat)
 */
const recordMembership = async (update) => {
  const chat = update?.chat;
  const member = update?.new_chat_member;
  if (!chat || !member || !GROUP_TYPES.has(chat.type)) return null;

  const chatId = chat.id.toString();
  const status = member.status || "member";
  const present = isPresent(status);
  const rights = readRights(member);

  // Telegram'dan kelgan maydonlar — HAR hodisada yangilanadi. Guruh nomi
  // o'zgarsa reyestrda eski nom turib qolsa, panelda butunlay boshqa
  // guruh belgilangandek ko'rinardi.
  const fromTelegram = {
    type: chat.type,
    title: chat.title || chat.username || chatId,
    username: chat.username || null,
    status,
    ...rights,
    // Bot ichida bo'lsa `leftAt` TOZALANADI: qayta qo'shilgan guruh
    // "chiqib ketgan" bo'lib qolmasligi kerak.
    leftAt: present ? null : new Date(),
  };

  return platformPrisma.telegramGroup.upsert({
    where: { chatId },
    // ⚠️ `isOfficial` va `official*` BERILMAYDI — admin panelning
    // maydonlari, bot ularga tegmaydi.
    update: fromTelegram,
    create: {
      chatId,
      ...fromTelegram,
      addedByTgId: update.from?.id ? update.from.id.toString() : null,
    },
  });
};

/**
 * ZAXIRA YO'L — guruhdan xabar kelganda reyestrni "yangilab qo'yadi".
 *
 * `my_chat_member` o'tmishga qaramagani uchun bot allaqachon a'zo bo'lgan
 * guruhlar faqat shu yo'l bilan ro'yxatga tushadi.
 *
 * ⚠️ HOLATGA TEGMAYDI: xabar kelishi botning admin ekanini bildirmaydi.
 * Yangi qator `member` holatida yoziladi, mavjud qatorning `status` ustuni
 * esa O'ZGARMAY qoladi — aks holda admin guruh har xabarda oddiy a'zoga
 * tushib ketardi. Haqiqiy holatni admin paneldagi "Tekshirish" aniqlaydi.
 *
 * @param {object} chat Telegram `Chat`
 */
const touchFromMessage = async (chat) => {
  if (!chat || !GROUP_TYPES.has(chat.type)) return null;

  const chatId = chat.id.toString();
  const title = chat.title || chat.username || chatId;

  return platformPrisma.telegramGroup.upsert({
    where: { chatId },
    update: { type: chat.type, title, username: chat.username || null },
    create: { chatId, type: chat.type, title, username: chat.username || null },
  });
};

module.exports = {
  GROUP_TYPES,
  PRESENT_STATUSES,
  isPresent,
  recordMembership,
  touchFromMessage,
};
