// Authentication service
const { User, TgUser } = require("../models");

/**
 * Authenticate student with username and password
 * @param {string} username 
 * @param {string} password 
 * @returns {Object|null} - User yoki null
 */
const authenticateStudent = async (username, password) => {
  try {
    // Find user
    const user = await User.findOne({ 
      username: username.toLowerCase().trim() 
    }).populate("class", "name");

    if (!user) {
      return { success: false, error: "USER_NOT_FOUND" };
    }

    // Check password
    const isMatch = await user.matchPassword(password);
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

    return { success: true, user };
  } catch (error) {
    console.error("Authentication error:", error);
    return { success: false, error: "SERVER_ERROR" };
  }
};

/**
 * Link Telegram user to student
 * @param {Object} telegramUser - Telegram user data
 * @param {Object} student - Student (User model)
 * @returns {Object}
 */
const linkTelegramUser = async (telegramUser, student) => {
  try {
    const telegramId = telegramUser.id.toString();
    const chatId = telegramUser.chatId || telegramId;

    // If TgUser already exists
    let tgUser = await TgUser.findOne({ telegramId });

    if (tgUser) {
      // Is it linked to the same student?
      if (tgUser.student.toString() === student._id.toString()) {
        return { success: false, error: "ALREADY_LINKED" };
      }

      // If linked to another student, update
      tgUser.student = student._id;
      tgUser.firstName = telegramUser.first_name;
      tgUser.lastName = telegramUser.last_name;
      tgUser.username = telegramUser.username;
      tgUser.chatId = chatId;
      tgUser.isActive = true;
      tgUser.notificationsEnabled = true;
      tgUser.lastActivity = new Date();
      await tgUser.save();
    } else {
      // Create new TgUser
      tgUser = await TgUser.create({
        telegramId,
        chatId,
        student: student._id,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        username: telegramUser.username,
      });
    }

    // Add telegramId to User model (if not exists)
    if (!student.telegramIds.includes(telegramId)) {
      await User.findByIdAndUpdate(student._id, {
        $addToSet: { telegramIds: telegramId }
      });
    }

    return { success: true, tgUser };
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
    const tgUser = await TgUser.findOne({ telegramId: telegramId.toString() })
      .populate({
        path: "student",
        select: "firstName lastName fullName class",
        populate: {
          path: "class",
          select: "name"
        }
      });
    return tgUser;
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
    const tgUser = await TgUser.findOne({ telegramId: telegramId.toString() });
    
    if (!tgUser) {
      return false;
    }

    // Remove telegramId from User model
    await User.findByIdAndUpdate(tgUser.student, {
      $pull: { telegramIds: telegramId.toString() }
    });

    // Delete or deactivate TgUser
    await TgUser.findByIdAndDelete(tgUser._id);

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
