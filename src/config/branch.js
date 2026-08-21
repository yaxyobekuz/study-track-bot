/**
 * FILIAL QATLAMI — bot uchun.
 *
 * Serverdagi bilan bir xil g'oya, faqat ixchamroq (bot kichik):
 *
 *   AsyncLocalStorage  → joriy filial
 *   client registry    → schemaName → PrismaClient (lazy)
 *   platformPrisma     → yo'naltirgichlar (username/telegramId → filial)
 *
 * `config/prisma.js` shu yerdan joriy filialning client'ini oladi, shuning
 * uchun `src/services/*` dagi so'rovlar o'zgarishsiz qoladi.
 */

const { AsyncLocalStorage } = require("node:async_hooks");

const { PrismaClient } = require("../generated/prisma");
const { PrismaClient: PlatformClient } = require("../generated/platform");
const { ObjectId } = require("bson");
const { config } = require("./index");

// ─────────────────────────────────────────────
// Kontekst
// ─────────────────────────────────────────────

const storage = new AsyncLocalStorage();

/** Berilgan filial kontekstida bajaradi. */
const runWithBranch = (branch, fn) => storage.run({ branch }, fn);

/** Joriy filial yoki `null`. */
const getBranch = () => storage.getStore()?.branch ?? null;

/** Joriy filial; bo'lmasa xato (jim buzilish o'rniga baland xato). */
const requireBranch = () => {
  const branch = getBranch();
  if (!branch) {
    throw new Error(
      "Filial konteksti yo'q: bazaga murojaat runWithBranch() ichida bo'lishi kerak",
    );
  }
  return branch;
};

// ─────────────────────────────────────────────
// Ulanish satri
// ─────────────────────────────────────────────

/** `DATABASE_URL` ning `schema` parametrini almashtiradi. */
const buildSchemaUrl = (schemaName) => {
  const url = new URL(config.databaseUrl);
  url.searchParams.set("schema", schemaName);
  url.searchParams.set("connection_limit", "3");
  return url.toString();
};

// ─────────────────────────────────────────────
// Platforma client'i
// ─────────────────────────────────────────────

// Bot yozadigan yagona platforma modeli — TelegramDirectory (uning PK'si
// `telegramId`, ya'ni generatsiya kerak emas), shuning uchun bu client'da
// auto-id kengaytmasi yo'q.
const platformPrisma = new PlatformClient({
  datasourceUrl: config.platformDatabaseUrl,
  log: ["error"],
});

// ─────────────────────────────────────────────
// Filial client'lari
// ─────────────────────────────────────────────

// Bot yozadigan modellar (id String @db.Char(24))
const AUTO_ID_MODELS = new Set([
  "TgUser",
  "User",
  "Grade",
  "Class",
  "Subject",
  "Schedule",
  "ScheduleLesson",
  "Holiday",
]);

const autoIdExtension = {
  name: "auto-id",
  query: {
    $allModels: {
      async create({ model, args, query }) {
        if (AUTO_ID_MODELS.has(model) && args.data && args.data.id == null) {
          args.data.id = new ObjectId().toHexString();
        }
        return query(args);
      },
      async createMany({ model, args, query }) {
        if (AUTO_ID_MODELS.has(model) && args.data) {
          const rows = Array.isArray(args.data) ? args.data : [args.data];
          for (const row of rows) {
            if (row.id == null) row.id = new ObjectId().toHexString();
          }
        }
        return query(args);
      },
    },
  },
};

const clients = new Map(); // schemaName -> extended client
const baseClients = new Map();

const getClientForSchema = (schemaName) => {
  const cached = clients.get(schemaName);
  if (cached) return cached;

  const base = new PrismaClient({
    datasourceUrl: buildSchemaUrl(schemaName),
    log: ["error"],
  });
  const client = base.$extends(autoIdExtension);

  baseClients.set(schemaName, base);
  clients.set(schemaName, client);
  return client;
};

const getCurrentClient = () => getClientForSchema(requireBranch().schemaName);

const disconnectAll = async () => {
  const all = [...baseClients.values()];
  clients.clear();
  baseClients.clear();
  await Promise.all(all.map((c) => c.$disconnect().catch(() => {})));
  await platformPrisma.$disconnect().catch(() => {});
};

// ─────────────────────────────────────────────
// Reyestr (qisqa keshli)
// ─────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 1000;
let cache = null;

/** Ishlaydigan filiallar. */
const listBranches = async () => {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;

  const rows = await platformPrisma.branch.findMany({
    where: { isArchived: false, status: "ready" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  cache = { at: Date.now(), rows };
  return rows;
};

/** @param {string} branchId */
const findBranchById = async (branchId) => {
  const rows = await listBranches();
  return rows.find((b) => b.id === branchId) ?? null;
};

/**
 * Har bir filialda ketma-ket bajaradi. Bitta filialdagi xato qolganlarini
 * to'xtatmaydi — kunlik hisobot butun tarmoq bo'ylab yuborilishi kerak.
 *
 * @param {(branch: object) => Promise<any>} fn
 */
const forEachBranch = async (fn) => {
  const branches = await listBranches();
  const results = [];

  for (const branch of branches) {
    try {
      results.push({ branch, value: await runWithBranch(branch, () => fn(branch)) });
    } catch (error) {
      console.error(`❌ [${branch.name}] ${error.message}`);
      results.push({ branch, error });
    }
  }

  return results;
};

module.exports = {
  runWithBranch,
  getBranch,
  requireBranch,
  getClientForSchema,
  getCurrentClient,
  disconnectAll,
  platformPrisma,
  listBranches,
  findBranchById,
  forEachBranch,
};
