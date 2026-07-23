/**
 * Bot uchun PrismaClient singleton + ID auto-generatsiya extension.
 *
 * Bot server bilan BIR XIL PostgreSQL bazani ishlatadi. Yangi yozuvlar
 * (asosan TgUser) uchun 24-hex ObjectId-mos ID generatsiya qilinadi —
 * server bilan bir xil format.
 */

const { PrismaClient } = require("../generated/prisma");
const { ObjectId } = require("bson");

// Bot yozadigan modellar (id String @db.Char(24))
const AUTO_ID_MODELS = new Set(["TgUser", "User", "Grade", "Class", "Subject", "Schedule", "ScheduleLesson", "Holiday"]);

const basePrisma = new PrismaClient({ log: ["error"] });

const prisma = basePrisma.$extends({
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
});

module.exports = prisma;
