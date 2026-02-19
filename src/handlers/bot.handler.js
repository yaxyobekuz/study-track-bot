// Bot handlers - /start, authentication and other commands
const TEXTS = require("../data/texts.data");
const { 
  authenticateStudent, 
  linkTelegramUser, 
  getTgUser, 
  unlinkTelegramUser,
  getStudentGradesByDate,
  toggleNotifications 
} = require("../services");
const { formatDailyReport, sendMessage } = require("../services/message.service");

// Store user state (session)
const userStates = new Map();

// States
const STATES = {
  IDLE: "IDLE",
  WAITING_USERNAME: "WAITING_USERNAME",
  WAITING_PASSWORD: "WAITING_PASSWORD",
  WAITING_UNLINK_CONFIRM: "WAITING_UNLINK_CONFIRM",
};

/**
 * Create keyboard buttons
 */
const getMainKeyboard = () => ({
  reply_markup: {
    keyboard: [
      [{ text: TEXTS.BTN_MY_GRADES }],
      [{ text: TEXTS.BTN_SETTINGS }, { text: TEXTS.BTN_STATISTICS }],
    ],
    resize_keyboard: true,
  },
});

const getStartKeyboard = () => ({
  reply_markup: {
    keyboard: [
      [{ text: TEXTS.START_BUTTON }],
    ],
    resize_keyboard: true,
  },
});

const getConfirmKeyboard = () => ({
  reply_markup: {
    inline_keyboard: [
      [
        { text: "✅ Ha", callback_data: "confirm_unlink" },
        { text: "❌ Yo'q", callback_data: "cancel_unlink" },
      ],
    ],
  },
});

/**
 * Get user state
 */
const getUserState = (chatId) => {
  return userStates.get(chatId) || { state: STATES.IDLE };
};

/**
 * Set user state
 */
const setUserState = (chatId, stateData) => {
  userStates.set(chatId, stateData);
};

/**
 * Clear user state
 */
const clearUserState = (chatId) => {
  userStates.delete(chatId);
};

/**
 * /start command handler
 */
const handleStart = async (bot, msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();

  // Check if already linked
  const existingTgUser = await getTgUser(telegramId);

  if (existingTgUser && existingTgUser.student) {
    const studentName = existingTgUser.student.fullName || 
      `${existingTgUser.student.firstName} ${existingTgUser.student.lastName || ""}`.trim();
    const classNames = existingTgUser.student.classes?.map(c => c.name).join(", ") || "Noma'lum";

    await sendMessage(bot, chatId, 
      `👋 Qaytib kelganingizdan xursandmiz!\n\n📚 O'quvchi: *${studentName}*\n🏫 Sinflar: *${classNames}*`,
      getMainKeyboard()
    );
    return;
  }

  // New user
  await sendMessage(bot, chatId, TEXTS.WELCOME, getStartKeyboard());
};

/**
 * Start button handler
 */
const handleStartButton = async (bot, msg) => {
  const chatId = msg.chat.id;
  
  setUserState(chatId, { state: STATES.WAITING_USERNAME });
  await sendMessage(bot, chatId, TEXTS.ENTER_USERNAME, {
    reply_markup: { remove_keyboard: true }
  });
};

/**
 * Username input handler
 */
const handleUsername = async (bot, msg, username) => {
  const chatId = msg.chat.id;
  
  setUserState(chatId, { 
    state: STATES.WAITING_PASSWORD, 
    username: username.trim() 
  });
  
  await sendMessage(bot, chatId, TEXTS.ENTER_PASSWORD);
};

/**
 * Password input handler
 */
const handlePassword = async (bot, msg, password) => {
  const chatId = msg.chat.id;
  const userState = getUserState(chatId);
  const username = userState.username;

  // Delete message (to hide password)
  try {
    await bot.deleteMessage(chatId, msg.message_id);
  } catch (e) {
    // Continue even if deletion fails
  }

  // Authentication
  const authResult = await authenticateStudent(username, password);

  if (!authResult.success) {
    let errorMessage = TEXTS.AUTH_FAILED;
    
    if (authResult.error === "NOT_STUDENT") {
      errorMessage = TEXTS.AUTH_STUDENT_ONLY;
    } else if (authResult.error === "INACTIVE_USER") {
      errorMessage = TEXTS.AUTH_INACTIVE_USER;
    }

    await sendMessage(bot, chatId, errorMessage, getStartKeyboard());
    clearUserState(chatId);
    return;
  }

  // Link Telegram user
  const telegramUser = {
    id: msg.from.id,
    chatId: chatId.toString(),
    first_name: msg.from.first_name,
    last_name: msg.from.last_name,
    username: msg.from.username,
  };

  const linkResult = await linkTelegramUser(telegramUser, authResult.user);

  if (!linkResult.success) {
    if (linkResult.error === "ALREADY_LINKED") {
      await sendMessage(bot, chatId, TEXTS.AUTH_ALREADY_LINKED, getMainKeyboard());
    } else {
      await sendMessage(bot, chatId, TEXTS.ERROR_GENERAL, getStartKeyboard());
    }
    clearUserState(chatId);
    return;
  }

  // Successful link
  const student = authResult.user;
  const studentName = student.fullName || `${student.firstName} ${student.lastName || ""}`.trim();
  const classNames = student.classes?.map(c => c.name).join(", ") || "Noma'lum";

  await sendMessage(bot, chatId, 
    TEXTS.AUTH_SUCCESS(studentName, classNames), 
    getMainKeyboard()
  );
  
  clearUserState(chatId);
};

/**
 * Today's grades handler
 */
const handleMyGrades = async (bot, msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();

  const tgUser = await getTgUser(telegramId);

  if (!tgUser) {
    await sendMessage(bot, chatId, TEXTS.ERROR_NOT_LINKED, getStartKeyboard());
    return;
  }

  const grades = await getStudentGradesByDate(tgUser.student._id, new Date());
  
  const reportData = {
    student: tgUser.student,
    grades,
    date: new Date(),
    hasGrades: grades.length > 0
  };

  const message = formatDailyReport(reportData);
  await sendMessage(bot, chatId, message, getMainKeyboard());
};

/**
 * Settings handler
 */
const handleSettings = async (bot, msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();

  const tgUser = await getTgUser(telegramId);

  if (!tgUser) {
    await sendMessage(bot, chatId, TEXTS.ERROR_NOT_LINKED, getStartKeyboard());
    return;
  }

  const notifStatus = tgUser.notificationsEnabled 
    ? TEXTS.NOTIFICATIONS_ON 
    : TEXTS.NOTIFICATIONS_OFF;

  await bot.sendMessage(chatId, 
    `${TEXTS.SETTINGS_MENU}\n\n${notifStatus}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ 
            text: TEXTS.TOGGLE_NOTIFICATIONS, 
            callback_data: `toggle_notif_${!tgUser.notificationsEnabled}` 
          }],
          [{ text: TEXTS.BTN_UNLINK, callback_data: "unlink" }],
        ],
      },
    }
  );
};

/**
 * Statistics handler
 */
const handleStatistics = async (bot, msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, TEXTS.STATISTICS_TEXT, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{
          text: TEXTS.BTN_WEB_APP,
          web_app: { url: process.env.DASHBOARD_URL }
        }],
      ],
    },
  });
};

/**
 * Callback query handler
 */
const handleCallbackQuery = async (bot, query) => {
  const chatId = query.message.chat.id;
  const telegramId = query.from.id.toString();
  const data = query.data;

  // Answer callback
  await bot.answerCallbackQuery(query.id);

  // Toggle notifications
  if (data.startsWith("toggle_notif_")) {
    const enabled = data === "toggle_notif_true";
    await toggleNotifications(telegramId, enabled);
    
    const status = enabled ? TEXTS.NOTIFICATIONS_ON : TEXTS.NOTIFICATIONS_OFF;
    await bot.editMessageText(
      `${TEXTS.SETTINGS_MENU}\n\n${status}`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ 
              text: TEXTS.TOGGLE_NOTIFICATIONS, 
              callback_data: `toggle_notif_${!enabled}` 
            }],
            [{ text: TEXTS.BTN_UNLINK, callback_data: "unlink" }],
          ],
        },
      }
    );
    return;
  }

  // Unlink account
  if (data === "unlink") {
    await bot.editMessageText(
      TEXTS.UNLINK_CONFIRM,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Ha", callback_data: "confirm_unlink" },
              { text: "❌ Yo'q", callback_data: "cancel_unlink" },
            ],
          ],
        },
      }
    );
    return;
  }

  if (data === "confirm_unlink") {
    await unlinkTelegramUser(telegramId);
    await bot.editMessageText(
      TEXTS.UNLINK_SUCCESS,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
      }
    );
    return;
  }

  if (data === "cancel_unlink") {
    await bot.deleteMessage(chatId, query.message.message_id);
    await sendMessage(bot, chatId, TEXTS.UNLINK_CANCELLED, getMainKeyboard());
    return;
  }
};

/**
 * Message handler (main)
 */
const handleMessage = async (bot, msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Check commands
  if (text === "/start") {
    await handleStart(bot, msg);
    return;
  }

  // Check button texts
  if (text === TEXTS.START_BUTTON) {
    await handleStartButton(bot, msg);
    return;
  }

  if (text === TEXTS.BTN_MY_GRADES) {
    await handleMyGrades(bot, msg);
    return;
  }

  if (text === TEXTS.BTN_SETTINGS) {
    await handleSettings(bot, msg);
    return;
  }

  if (text === TEXTS.BTN_STATISTICS) {
    await handleStatistics(bot, msg);
    return;
  }

  // Process message based on state
  const userState = getUserState(chatId);

  if (userState.state === STATES.WAITING_USERNAME) {
    await handleUsername(bot, msg, text);
    return;
  }

  if (userState.state === STATES.WAITING_PASSWORD) {
    await handlePassword(bot, msg, text);
    return;
  }

  // If no state, suggest start
  const tgUser = await getTgUser(msg.from.id.toString());
  if (!tgUser) {
    await sendMessage(bot, chatId, TEXTS.ERROR_NOT_LINKED, getStartKeyboard());
  }
};

/**
 * Register all handlers to bot
 */
const registerHandlers = (bot) => {
  // /start command
  bot.onText(/\/start/, (msg) => handleStart(bot, msg));

  // All messages
  bot.on("message", (msg) => {
    if (msg.text && !msg.text.startsWith("/")) {
      handleMessage(bot, msg);
    }
  });

  // Callback queries
  bot.on("callback_query", (query) => handleCallbackQuery(bot, query));

  console.log("📝 Bot handlers registered");
};

module.exports = {
  registerHandlers,
  handleStart,
  handleMessage,
  handleCallbackQuery,
};
