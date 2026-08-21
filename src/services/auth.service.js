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

const bcrypt = require("bcrypt");
const prisma = require("../config/prisma");
const {
  platformPrisma,
  runWithBranch,
  findBranchById,
} = require("../config/branch");

// classes junction → eski [{_id,name}] shakliga tekislaydi
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
 * Authenticate student with username and password.
 *
 * Filial username bo'yicha aniqlanadi, keyin parol O'SHA filial bazasida
 * tekshiriladi — parol platformada saqlanmaydi.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Object} - { success, user, branch } yoki { success: false, error }
 */
const authenticateStudent = async (username, password) => {
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
        include: { classes: { include: { class: { select: { id: true, name: true } } } } },
      });

      if (!user) {
        return { success: false, error: "USER_NOT_FOUND" };
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return { success: false, error: "INVALID_PASSWORD" };
      }

      // Must be a student
      if (user.role !== "student") {
        return { success: false, error: "NOT_STUDENT" };
      }

      // Must be active
      if (!user.isActive) {
        return { success: false, error: "INACTIVE_USER" };
      }

      return { success: true, user: flattenClasses(user), branch };
    });
  } catch (error) {
    console.error("Authentication error:", error);
    return { success: false, error: "SERVER_ERROR" };
  }
};

/**
 * Link Telegram user to student.
 *
 * `TgUser` — o'quvchining FILIAL bazasida, `TelegramDirectory` esa
 * platformada: keyingi xabarlarda filial shundan aniqlanadi.
 *
 * @param {Object} telegramUser - Telegram user data
 * @param {Object} student - Student (User)
 * @param {Object} branch - o'quvchining filiali
 * @returns {Object}
 */
const linkTelegramUser = async (telegramUser, student, branch) => {
  try {
    const telegramId = telegramUser.id.toString();
    const chatId = telegramUser.chatId || telegramId;
    const studentId = student.id;

    return await runWithBranch(branch, async () => {
      // If TgUser already exists
      let tgUser = await prisma.tgUser.findUnique({ where: { telegramId } });

      if (tgUser) {
        // Is it linked to the same student?
        if (String(tgUser.student) === String(studentId)) {
          return { success: false, error: "ALREADY_LINKED" };
        }

        // If linked to another student, update
        tgUser = await prisma.tgUser.update({
          where: { telegramId },
          data: {
            student: studentId,
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
            student: studentId,
            firstName: telegramUser.first_name,
            lastName: telegramUser.last_name,
            username: telegramUser.username,
          },
        });
      }

      // Add telegramId to User model (if not exists)
      const telegramIds = student.telegramIds || [];
      if (!telegramIds.includes(telegramId)) {
        await prisma.user.update({
          where: { id: studentId },
          data: { telegramIds: { push: telegramId } },
        });
      }

      // Yo'naltirgich — SO'NGGI qadam: filial bazasidagi yozuv muvaffaqiyatli
      // bo'lgandagina platformaga ishora qo'yamiz.
      await platformPrisma.telegramDirectory.upsert({
        where: { telegramId },
        create: { telegramId, branchId: branch.id, studentId },
        update: { branchId: branch.id, studentId },
      });

      return { success: true, tgUser: { ...tgUser }, branch };
    });
  } catch (error) {
    console.error("Link telegram user error:", error);
    return { success: false, error: "SERVER_ERROR" };
  }
};

/**
 * Find Telegram user (filial yo'naltirgich orqali aniqlanadi).
 * @param {string} telegramId
 * @returns {Object|null} - `{ ...tgUser, student, branch }`
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

      // student — scalar String (relation yo'q), qo'lda yuklaymiz
      const student = await prisma.user.findUnique({
        where: { id: tgUser.student },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          classes: { include: { class: { select: { id: true, name: true } } } },
        },
      });

      return {
        ...tgUser,
        student: student ? flattenClasses(student) : null,
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
 * @returns {boolean}
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
      const student = await prisma.user.findUnique({
        where: { id: tgUser.student },
        select: { telegramIds: true },
      });
      if (student) {
        await prisma.user.update({
          where: { id: tgUser.student },
          data: { telegramIds: student.telegramIds.filter((t) => t !== tid) },
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
  authenticateStudent,
  linkTelegramUser,
  getTgUser,
  unlinkTelegramUser,
  resolveBranchByTelegramId,
};
