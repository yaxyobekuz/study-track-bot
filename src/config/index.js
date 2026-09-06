/**
 * PLATFORMA ULANISH SATRI — `DATABASE_URL` dan hosila.
 *
 * ⚠️ MODUL YUKLANGANDA HISOBLANADI, `validateConfig()` ICHIDA EMAS.
 *
 * `index.js` da tartib shunday:
 *
 *     6-qator:  require("./src/config/database")   → branch.js → PlatformClient
 *     12-qator: validateConfig()
 *
 * Ya'ni Prisma client 6-qatorda YARATILADI, fallback esa 12-qatorda
 * ishlardi. Agar `.env` da `PLATFORM_DATABASE_URL` bo'lmasa,
 * `datasourceUrl: null` bilan `PrismaClientConstructorValidationError`
 * tashlanardi va bot startupda yiqilardi — deploy paytida aynan shu
 * bo'lgan.
 *
 * ⚠️ `prisma generate` bu o'zgaruvchini TALAB QILMAYDI (u ulanmaydi),
 * shuning uchun build muvaffaqiyatli o'tib, xato faqat ishga tushishda
 * chiqadi. Buni faqat ishga tushirish logidan bilib olish mumkin.
 *
 * Serverda bu allaqachon to'g'ri (`env.config.js` da modul darajasida),
 * bot esa undan orqada qolgan edi.
 *
 * @param {string|undefined} databaseUrl
 * @param {string} schema
 * @returns {string|null}
 */
const derivePlatformUrl = (databaseUrl, schema) => {
  if (!databaseUrl) return null;

  try {
    const url = new URL(databaseUrl);
    url.searchParams.set("schema", schema);
    return url.toString();
  } catch {
    // Noto'g'ri formatdagi satr — `validateConfig` uni baribir ushlaydi
    return null;
  }
};

const PLATFORM_SCHEMA = process.env.PLATFORM_SCHEMA || "platform";

const PLATFORM_DATABASE_URL =
  process.env.PLATFORM_DATABASE_URL ||
  derivePlatformUrl(process.env.DATABASE_URL, PLATFORM_SCHEMA);

// ⚠️ `process.env` ga ham qaytariladi: `prisma generate` uni
// datasource'dan o'qiydi va CLI chaqiruvlarida kerak bo'ladi.
if (PLATFORM_DATABASE_URL && !process.env.PLATFORM_DATABASE_URL) {
  process.env.PLATFORM_DATABASE_URL = PLATFORM_DATABASE_URL;
}

const config = {
  // Node environment
  nodeEnv: process.env.NODE_ENV || "development",
  
  // Telegram bot token
  botToken: process.env.BOT_TOKEN,
  
  // PostgreSQL (Prisma) — server bilan bir xil baza.
  // Filial `?schema=` bilan tanlanadi (config/branch.js).
  databaseUrl: process.env.DATABASE_URL,

  // Platforma schema'si — filiallar reyestri va yo'naltirgichlar
  // (username → filial, telegramId → filial). Kiritilmasa DATABASE_URL dan
  // hosil qilinadi (`validateConfig`).
  platformDatabaseUrl: PLATFORM_DATABASE_URL,
  platformSchema: PLATFORM_SCHEMA,
  
  // Daily report sending time (HH:MM format)
  dailyReportTime: process.env.DAILY_REPORT_TIME || "18:00",
  
  // Rate limit settings
  messageDelayMs: parseInt(process.env.MESSAGE_DELAY_MS, 10) || 50,
  batchSize: parseInt(process.env.BATCH_SIZE, 10) || 25,
  batchDelayMs: parseInt(process.env.BATCH_DELAY_MS, 10) || 1000,
  
  // Timezone
  timezone: process.env.TIMEZONE || "Asia/Tashkent",
};

// Validate required configurations
const validateConfig = () => {
  if (!config.botToken) {
    throw new Error("BOT_TOKEN environment variable is required");
  }
  
  // Check time format (HH:MM)
  const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  if (!timeRegex.test(config.dailyReportTime)) {
    throw new Error("DAILY_REPORT_TIME must be in HH:MM format (e.g., 18:00)");
  }

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  // ⚠️ Bu yerda faqat TEKSHIRUV qoladi, hosil qilish emas: satr modul
  // yuklanganda hisoblangan (yuqoridagi izoh). Agar shunda ham bo'sh
  // bo'lsa, `DATABASE_URL` noto'g'ri formatda — buni jim o'tkazib
  // yubormaslik kerak.
  if (!config.platformDatabaseUrl) {
    throw new Error(
      "PLATFORM_DATABASE_URL hosil qilinmadi — DATABASE_URL formatini tekshiring",
    );
  }

  return true;
};

module.exports = { config, validateConfig };
