// Authentication service (Prisma)
const bcrypt = require("bcrypt");
const prisma = require("../config/prisma");

// classes junction → eski [{_id,name}] shakliga tekislaydi
function flattenClasses(user) {
  if (!user) return user;
  const out = { ...user, id: user.id };
  if (Array.isArray(user.classes)) {
    out.classes = user.classes.map((uc) =>
      uc.class ? { ...uc.class, id: uc.class.id } : uc,
    );
  }
  return out;
}

/**
 * Authenticate student with username and password
 * @param {string} username
 * @param {string} password
 * @returns {Object|null} - User yoki null
 */
const authenticateStudent = async (username, password) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
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

    return { success: true, user: flattenClasses(user) };
  } catch (error) {
    console.error("Authentication error:", error);
    return { success: false, error: "SERVER_ERROR" };
  }
};

/**
 * Link Telegram user to student
 * @param {Object} telegramUser - Telegram user data
 * @param {Object} student - Student (User)
 * @returns {Object}
 */
const linkTelegramUser = async (telegramUser, student) => {
  try {
    const telegramId = telegramUser.id.toString();
    const chatId = telegramUser.chatId || telegramId;
    const studentId = student.id;

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

    return { success: true, tgUser: { ...tgUser, id: tgUser.id } };
  } catch (error) {
    console.error("Link telegram user error:", error);
    return { success: false, error: "SERVER_ERROR" };
  }
};

/**
 * Find Telegram user
 * @param {string} telegramId
 * @returns {Object|null}
 */
const getTgUser = async (telegramId) => {
  try {
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
      id: tgUser.id,
      student: student ? flattenClasses(student) : null,
    };
  } catch (error) {
    console.error("Get TgUser error:", error);
    return null;
  }
};

/**
 * Unlink Telegram connection
 * @param {string} telegramId
 * @returns {boolean}
 */
const unlinkTelegramUser = async (telegramId) => {
  try {
    const tid = telegramId.toString();
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
};
