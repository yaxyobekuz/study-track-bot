// Authentication service (Prisma)
//
// FILIALLASHTIRISH: bot qaysi filial bazasiga borishni PLATFORMADAGI
// yo'naltirgichlardan biladi:
//
//   login    → UserDirectory     (username → filial)
//   xabar    → TelegramDirectory (telegramId → filial)
//
// Ikkinchisi bo'lmasa har kelgan xabarda barcha filial schema'larini
// skanerlashga to'g'ri kelardi.
//
// ── IKKI TUR BOG'LANISH ──────────────────────────────────────────────
//
// Botga HAR QANDAY rol kira oladi va kirgan odamga qarab boshqa narsa
// ko'rsatiladi:
//
//   "student" — o'quvchi logini. Botdan ota-ona foydalanadi va
//               farzandining baholarini ko'radi (eski, asosiy oqim).
//   "staff"   — xodim logini. Xodim O'ZIGA tegishli tezkor ma'lumotni
//               ko'radi (davomat, topshiriq, darslar, oylik).
//
// ⚠️ TUR SAQLANADI, ROL SAQLANMAYDI (`TgUser.linkKind`). Odamning roli
// keyin o'zgarishi mumkin (o'qituvchi → ma'muriyat) va muhrlangan rol
// jimgina eskirib, botda noto'g'ri menyu ko'rsatardi. Shu sababli menyu
// uchun rol HAR SAFAR `User.role` dan jonli o'qiladi.

const bcrypt = require("bcrypt");
const prisma = require("../config/prisma");
const {
  platformPrisma,
  runWithBranch,
  findBranchById,
} = require("../config/branch");

/** Bog'lanish turlari — `TgUser.linkKind` / `TelegramDirectory.linkKind`. */
const LINK_KIND = { STUDENT: "student", STAFF: "staff" };

/** Rol → bog'lanish turi. Rollar dinamik, shuning uchun "o'quvchi EMAS" = xodim. */
const kindForRole = (role) =>
  role === "student" ? LINK_KIND.STUDENT : LINK_KIND.STAFF;

// classes junction → eski [{id,name}] shakliga tekislaydi
function flattenClasses(user) {
  if (!user) return user;
  const out = { ...user };
  if (Array.isArray(user.classes)) {
    out.classes = user.classes.map((uc) =>
      uc.class ? { ...uc.class } : uc,
    );
  }
  return out;
}

/** Foydalanuvchining to'liq ismi. */
const fullNameOf = (user) =>
  user ? `${user.firstName} ${user.lastName || ""}`.trim() : "";

// O'quvchi uchun sinflar ham kerak, xodim uchun esa rollar.
const STUDENT_INCLUDE = {
  classes: { include: { class: { select: { id: true, name: true } } } },
};

/**
 * Telegram ID bo'yicha filialni aniqlaydi.
 * @param {string|number} telegramId
 * @returns {Promise<object|null>}
 */
const resolveBranchByTelegramId = async (telegramId) => {
  const link = await platformPrisma.telegramDirectory.findUnique({
    where: { telegramId: String(telegramId) },
  });
  if (!link) return null;
  return findBranchById(link.branchId);
};

/**
 * Login va parol bo'yicha foydalanuvchini tekshiradi — ROLIDAN QAT'I NAZAR.
 *
 * Filial username bo'yicha aniqlanadi, keyin parol O'SHA filial bazasida
 * tekshiriladi — parol platformada saqlanmaydi.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<object>} `{ success, user, branch, kind }` yoki `{ success: false, error }`
 */
const authenticateUser = async (username, password) => {
  try {
    const entry = await platformPrisma.userDirectory.findUnique({
      where: { username: username.toLowerCase().trim() },
    });

    if (!entry) {
      return { success: false, error: "USER_NOT_FOUND" };
    }

    const branch = await findBranchById(entry.branchId);
    if (!branch) {
      // Filial arxivlangan yoki hali tayyor emas
      return { success: false, error: "INACTIVE_USER" };
    }

    return await runWithBranch(branch, async () => {
      const user = await prisma.user.findUnique({
        where: { id: entry.id },
        include: STUDENT_INCLUDE,
      });

      if (!user) {
        return { success: false, error: "USER_NOT_FOUND" };
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return { success: false, error: "INVALID_PASSWORD" };
      }

      // Must be active
      if (!user.isActive) {
        return { success: false, error: "INACTIVE_USER" };
      }

      // ⚠️ ARXIVLANGAN XODIM/O'QUVCHI KIRMAYDI. `isActive` buni ushlamaydi:
      // arxivlash alohida bayroq (`isArchived`) va arxivdagi qator faol
      // bo'lib turishi mumkin — ishdan ketgan xodim botdan oylik va
      // topshiriqlarini ko'rib turmasligi kerak.
      if (user.isArchived) {
        return { success: false, error: "INACTIVE_USER" };
      }

      return {
        success: true,
        user: flattenClasses(user),
        branch,
        kind: kindForRole(user.role),
      };
    });
  } catch (error) {
    console.error("Authentication error:", error);
    return { success: false, error: "SERVER_ERROR" };
  }
};

/**
 * Telegram hisobini foydalanuvchiga bog'laydi (o'quvchi YOKI xodim).
 *
 * `TgUser` — FILIAL bazasida, `TelegramDirectory` esa platformada:
 * keyingi xabarlarda filial shundan aniqlanadi.
 *
 * ⚠️ BITTA TELEGRAM = BITTA BOG'LANISH. Boshqa hisobga kirilsa eski
 * bog'lanish ustiga yoziladi: xodim o'quvchi logini bilan kirsa
 * (farzandi shu maktabda o'qiydi) xodim bog'lanishi almashadi va teskarisi.
 *
 * @param {Object} telegramUser - Telegram user data
 * @param {Object} person - User (o'quvchi yoki xodim)
 * @param {Object} branch - foydalanuvchining filiali
 * @param {string} [kind] - LINK_KIND; berilmasa roldan aniqlanadi
 * @returns {Promise<object>}
 */
const linkTelegramUser = async (telegramUser, person, branch, kind) => {
  try {
    const telegramId = telegramUser.id.toString();
    const chatId = telegramUser.chatId || telegramId;
    const userId = person.id;
    const linkKind = kind || kindForRole(person.role);
    // ⚠️ `student` FAQAT o'quvchi bog'lanishida to'ladi. Xodimda NULL va
    // bu ataylab: o'quvchiga xabar yuboradigan serverdagi oqimlar
    // (`penalty`, `debtReminder`, `premiumNotification`) shu ustun
    // bo'yicha qidiradi va xodim qatoriga hech qachon urilmaydi.
    const student = linkKind === LINK_KIND.STUDENT ? userId : null;

    return await runWithBranch(branch, async () => {
      // If TgUser already exists
      let tgUser = await prisma.tgUser.findUnique({ where: { telegramId } });

      if (tgUser) {
        // Ayni shu hisobga allaqachon bog'langanmi?
        if (String(tgUser.userId) === String(userId)) {
          return { success: false, error: "ALREADY_LINKED" };
        }

        // Boshqa hisobga bog'langan — ustiga yozamiz
        tgUser = await prisma.tgUser.update({
          where: { telegramId },
          data: {
            userId,
            linkKind,
            student,
            firstName: telegramUser.first_name,
            lastName: telegramUser.last_name,
            username: telegramUser.username,
            chatId,
            isActive: true,
            notificationsEnabled: true,
            lastActivity: new Date(),
          },
        });
      } else {
        // Create new TgUser
        tgUser = await prisma.tgUser.create({
          data: {
            telegramId,
            chatId,
            userId,
            linkKind,
            student,
            firstName: telegramUser.first_name,
            lastName: telegramUser.last_name,
            username: telegramUser.username,
          },
        });
      }

      // Add telegramId to User model (if not exists)
      const telegramIds = person.telegramIds || [];
      if (!telegramIds.includes(telegramId)) {
        await prisma.user.update({
          where: { id: userId },
          data: { telegramIds: { push: telegramId } },
        });
      }

      // Yo'naltirgich — SO'NGGI qadam: filial bazasidagi yozuv muvaffaqiyatli
      // bo'lgandagina platformaga ishora qo'yamiz.
      await platformPrisma.telegramDirectory.upsert({
        where: { telegramId },
        create: { telegramId, branchId: branch.id, userId, linkKind, studentId: student },
        update: { branchId: branch.id, userId, linkKind, studentId: student },
      });

      return { success: true, tgUser: { ...tgUser }, branch, kind: linkKind };
    });
  } catch (error) {
    console.error("Link telegram user error:", error);
    return { success: false, error: "SERVER_ERROR" };
  }
};

/**
 * Find Telegram user (filial yo'naltirgich orqali aniqlanadi).
 *
 * Qaytaradi: `{ ...tgUser, kind, person, student, branch }`
 *
 *   `kind`    — "student" | "staff"
 *   `person`  — bog'langan odam (IKKI TURDA HAM to'ladi)
 *   `student` — faqat o'quvchi bog'lanishida obyekt, xodimda `null`
 *
 * ⚠️ `student` ATAYLAB SAQLANGAN: o'quvchi oqimidagi handler'lar
 * (`handleMyGrades`, kunlik hisobot) uni shu nom bilan o'qiydi.
 *
 * @param {string} telegramId
 * @returns {Promise<object|null>}
 */
const getTgUser = async (telegramId) => {
  try {
    const branch = await resolveBranchByTelegramId(telegramId);
    if (!branch) return null;

    return await runWithBranch(branch, async () => {
      const tgUser = await prisma.tgUser.findUnique({
        where: { telegramId: telegramId.toString() },
      });
      if (!tgUser) return null;

      // userId — scalar String (relation yo'q), qo'lda yuklaymiz
      const person = await prisma.user.findUnique({
        where: { id: tgUser.userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          extraRoles: true,
          isActive: true,
          isArchived: true,
          penaltyPoints: true,
          workStartTime: true,
          workEndTime: true,
          workDays: true,
          classes: { include: { class: { select: { id: true, name: true } } } },
        },
      });

      const flat = person ? flattenClasses(person) : null;
      const kind = tgUser.linkKind || "student";

      return {
        ...tgUser,
        kind,
        person: flat,
        // Xodim bog'lanishida o'quvchi YO'Q — o'quvchi oqimidagi
        // handler'lar aynan shu `null` ga qarab to'xtaydi.
        student: kind === LINK_KIND.STUDENT ? flat : null,
        branch,
      };
    });
  } catch (error) {
    console.error("Get TgUser error:", error);
    return null;
  }
};

/**
 * Unlink Telegram connection.
 * @param {string} telegramId
 * @returns {Promise<boolean>}
 */
const unlinkTelegramUser = async (telegramId) => {
  try {
    const tid = telegramId.toString();
    const branch = await resolveBranchByTelegramId(tid);
    if (!branch) return false;

    const removed = await runWithBranch(branch, async () => {
      const tgUser = await prisma.tgUser.findUnique({ where: { telegramId: tid } });

      if (!tgUser) {
        return false;
      }

      // Remove telegramId from User model
      const person = await prisma.user.findUnique({
        where: { id: tgUser.userId },
        select: { telegramIds: true },
      });
      if (person) {
        await prisma.user.update({
          where: { id: tgUser.userId },
          data: { telegramIds: person.telegramIds.filter((t) => t !== tid) },
        });
      }

      // Delete TgUser
      await prisma.tgUser.delete({ where: { id: tgUser.id } });

      return true;
    });

    // Yo'naltirgichni har holda tozalaymiz: filial bazasida yozuv topilmasa
    // ham, platformadagi ishora yetim bo'lib qolmasligi kerak.
    await platformPrisma.telegramDirectory
      .deleteMany({ where: { telegramId: tid } })
      .catch(() => {});

    return removed;
  } catch (error) {
    console.error("Unlink telegram user error:", error);
    return false;
  }
};

module.exports = {
  LINK_KIND,
  kindForRole,
  fullNameOf,
  authenticateUser,
  linkTelegramUser,
  getTgUser,
  unlinkTelegramUser,
  resolveBranchByTelegramId,
};
