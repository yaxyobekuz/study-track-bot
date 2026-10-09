// Bot handlers - /start, authentication and other commands
//
// ── IKKI OQIM ────────────────────────────────────────────────────────
//
// Botga HAR QANDAY rol kiradi va kirgan odamga qarab boshqa menyu ochiladi:
//
//   OTA-ONA  (o'quvchi logini)  → baholar, statistika, bildirishnoma
//   XODIM    (o'z logini)       → davomat, topshiriq, darslar, oylik
//
// ⚠️ TUGMA MATNLARI IKKI MENYUDA TAKRORLANMASLIGI SHART. Telegram'da
// "tugma" — oddiy matnli xabar, ya'ni handler kelgan satrni solishtirib
// ishlaydi. Bir xil satr bo'lsa xodimga ota-ona oqimi ochilib ketardi.
//
// ⚠️ HAR BIR HANDLER BOG'LANISH TURINI QAYTA TEKSHIRADI. Telegram
// klaviaturasi MIJOZDA qoladi: rol almashgandan keyin ham odam eski
// tugmani bosib yuborishi mumkin, shuning uchun "sen qaysi oqimdasan"
// degan savol tugma matniga emas, bazadagi `linkKind` ga qarab beriladi.

const TEXTS = require("../data/texts.data");
const {
  authenticateUser,
  linkTelegramUser,
  getTgUser,
  unlinkTelegramUser,
  resolveBranchByTelegramId,
  getStudentGradesByDate,
  toggleNotifications,
  fullNameOf,
  LINK_KIND,
} = require("../services");
const staffService = require("../services/staff.service");
const issueService = require("../services/issue.service");
const { runWithBranch } = require("../config/branch");
const {
  formatDailyReport,
  formatStaffAttendance,
  formatStaffTasks,
  formatStaffLessons,
  formatStaffPayroll,
  sendMessage,
  escapeMarkdown,
} = require("../services/message.service");
const { track, tashkentDay } = require("../services/activity.service");

// Store user state (session)
const userStates = new Map();

// States
const STATES = {
  IDLE: "IDLE",
  WAITING_USERNAME: "WAITING_USERNAME",
  WAITING_PASSWORD: "WAITING_PASSWORD",
  WAITING_UNLINK_CONFIRM: "WAITING_UNLINK_CONFIRM",
  // Muammo yuborish: kategoriya tanlash → matn yozish
  WAITING_ISSUE_CATEGORY: "WAITING_ISSUE_CATEGORY",
  WAITING_ISSUE_BODY: "WAITING_ISSUE_BODY",
};

/** Muammo oqimining holatlari — menyu tugmasi bosilsa tozalanadi. */
const ISSUE_STATES = new Set([
  STATES.WAITING_ISSUE_CATEGORY,
  STATES.WAITING_ISSUE_BODY,
]);

/**
 * BARCHA MENYU TUGMALARI — "odam oqimdan chiqib ketdimi" degan savol uchun.
 *
 * ⚠️ `BTN_ISSUE_CANCEL` BU RO'YXATDA YO'Q: u menyu tugmasi emas, muammo
 * oqimining o'z tugmasi va uni oqim handler'larining o'zi qabul qiladi.
 */
const MENU_BUTTONS = new Set([
  TEXTS.START_BUTTON,
  TEXTS.BTN_MY_GRADES,
  TEXTS.BTN_STATISTICS,
  TEXTS.BTN_STAFF_ATTENDANCE,
  TEXTS.BTN_STAFF_TASKS,
  TEXTS.BTN_STAFF_LESSONS,
  TEXTS.BTN_STAFF_PAYROLL,
  TEXTS.BTN_SETTINGS,
  TEXTS.BTN_ISSUE,
]);

/**
 * XODIM HODISALARI PREFIKSI — serverdagi `activityDashboard.service.js`
 * dagi `STAFF_PREFIX` bilan AYNI satr.
 *
 * ⚠️ IKKALASI BIRGA O'ZGARADI. Panelda "bot" kanali OTA-ONA QAMROVINI
 * bildiradi (`botRate` ning maxraji — o'quvchiga bog'langan hisoblar), va
 * xodim hodisasi shu prefiks bo'yicha sanoqdan chiqariladi. Prefiks
 * mos kelmasa ulush jimgina 100% dan oshib ketardi.
 */
const STAFF_ACTION = "bot.staff.";

/**
 * Create keyboard buttons
 */
const getMainKeyboard = () => ({
  reply_markup: {
    keyboard: [
      [{ text: TEXTS.BTN_MY_GRADES }],
      [{ text: TEXTS.BTN_SETTINGS }, { text: TEXTS.BTN_STATISTICS }],
      [{ text: TEXTS.BTN_ISSUE }],
    ],
    resize_keyboard: true,
  },
});

/**
 * XODIM MENYUSI.
 *
 * `showLessons` — jadvalda darsi bor xodimda "Bugungi darslarim" tugmasi.
 * ⚠️ ROL NOMIGA EMAS, MA'LUMOTGA QARAB (`staff.service#hasLessons`):
 * rollar dinamik va dars beradigan ma'muriyat xodimi ham bor, shuning
 * uchun "o'qituvchimi?" degan savol jadvaldan so'raladi.
 *
 * @param {boolean} showLessons
 */
const getStaffKeyboard = (showLessons = false) => {
  const keyboard = [
    [{ text: TEXTS.BTN_STAFF_ATTENDANCE }, { text: TEXTS.BTN_STAFF_TASKS }],
  ];

  if (showLessons) {
    keyboard.push([{ text: TEXTS.BTN_STAFF_LESSONS }]);
  }

  keyboard.push([
    { text: TEXTS.BTN_STAFF_PAYROLL },
    { text: TEXTS.BTN_SETTINGS },
  ]);

  keyboard.push([{ text: TEXTS.BTN_ISSUE }]);

  return { reply_markup: { keyboard, resize_keyboard: true } };
};

/**
 * MUAMMO OQIMINING KLAVIATURASI — faol kategoriyalar, ikkitadan qatorda.
 *
 * ⚠️ TUGMA MATNI — KATEGORIYA NOMINING O'ZI. Telegram'dagi oddiy
 * klaviatura `callback_data` bermaydi: javob sifatida faqat matn qaytadi
 * va kategoriya shu nom bo'yicha topiladi (`issue.service#
 * findActiveCategoryByName`).
 *
 * @param {Array<{id: string, name: string}>} categories
 */
const getIssueCategoryKeyboard = (categories) => {
  const keyboard = [];
  for (let i = 0; i < categories.length; i += 2) {
    keyboard.push(categories.slice(i, i + 2).map((c) => ({ text: c.name })));
  }
  keyboard.push([{ text: TEXTS.BTN_ISSUE_CANCEL }]);

  return { reply_markup: { keyboard, resize_keyboard: true } };
};

/**
 * Matn yozilayotganda — faqat "bekor qilish".
 *
 * ⚠️ MENYU TUGMALARI OLIB TASHLANADI: ular ko'rinib turgan bo'lsa odam
 * bexosdan bosib yuborardi va yozgan matni yo'qolardi. Menyu bosilsa
 * oqim baribir tashlab ketilgan deb hisoblanadi (`handleMessage`).
 */
const getIssueCancelKeyboard = () => ({
  reply_markup: {
    keyboard: [[{ text: TEXTS.BTN_ISSUE_CANCEL }]],
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

/**
 * XODIM OQIMI OCHIQMI?
 *
 * ⚠️ HAR SO'ROVDA TEKSHIRILADI, bir marta loginda emas.
 * `authenticateUser` arxivlangan xodimni kiritmaydi, lekin ALLAQACHON
 * bog'langan hisob o'z-o'zidan uzilmaydi: odam ishdan ketgach botda
 * oylik va topshiriqlarini ko'rib turardi.
 *
 * @param {object} tgUser - `getTgUser()` natijasi
 * @returns {boolean}
 */
const staffFlowOpen = (tgUser) =>
  tgUser?.kind === LINK_KIND.STAFF &&
  Boolean(tgUser.person) &&
  tgUser.person.isActive &&
  !tgUser.person.isArchived;

/**
 * Bog'lanish turiga mos klaviatura. Xodimda dars bor-yo'qligi tekshiriladi.
 * @param {object} tgUser - `getTgUser()` natijasi
 */
const keyboardFor = async (tgUser) => {
  // ⚠️ `person` NULL BO'LISHI MUMKIN — bazada YETIM qatorlar bor:
  // bog'langan odam keyin o'chirilgan, `tg_users` qatori esa qolgan.
  // Bunday holda xodim klaviaturasini qurishga urinib bo'lmaydi
  // (`hasLessons(null)` yiqilardi) va u ma'nosiz ham: foydalanuvchini
  // qayta login qilishga yuborish kerak.
  if (!staffFlowOpen(tgUser)) {
    return getMainKeyboard();
  }
  const showLessons = await staffService.hasLessons(tgUser.person);
  return getStaffKeyboard(showLessons);
};

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
 * BOG'LANGAN XODIMNI OLADI yoki foydalanuvchini to'g'ri yo'lga qaytaradi.
 *
 * Har bir xodim handler'i shundan boshlanadi: bog'lanmagan bo'lsa login
 * taklif qiladi, ota-ona sifatida bog'langan bo'lsa (eski klaviaturadan
 * bosilgan tugma) o'z menyusini qaytarib beradi.
 *
 * @returns {Promise<object|null>} tgUser yoki `null` (javob yuborilgan)
 */
const requireStaff = async (bot, msg) => {
  const chatId = msg.chat.id;
  const tgUser = await getTgUser(msg.from.id.toString());

  if (!tgUser) {
    await sendMessage(bot, chatId, TEXTS.ERROR_NOT_LINKED, getStartKeyboard());
    return null;
  }

  // ⚠️ YETIM QATOR — bog'langan odam o'chirilgan. Buni rol almashishi
  // bilan ARALASHTIRMASLIK kerak: "endi ota-ona sifatida kirgansiz"
  // degan xabar yolg'on bo'lardi, chunki hech qanday hisob qolmagan.
  if (!tgUser.person) {
    await sendMessage(bot, chatId, TEXTS.ERROR_NOT_LINKED, getStartKeyboard());
    return null;
  }

  if (tgUser.kind !== LINK_KIND.STAFF) {
    // Eski klaviaturadagi xodim tugmasi — endi ota-ona sifatida kirgan
    await sendMessage(
      bot,
      chatId,
      TEXTS.SWITCHED_TO_STUDENT,
      getMainKeyboard(),
    );
    return null;
  }

  // ⚠️ Bog'lanish O'CHIRILMAYDI — arxivdan qaytarilsa (bu normal holat)
  // qayta login qilish shart bo'lmasligi kerak (`staffFlowOpen` izohi).
  if (!staffFlowOpen(tgUser)) {
    await sendMessage(
      bot,
      chatId,
      TEXTS.STAFF_ACCESS_REVOKED,
      { reply_markup: { remove_keyboard: true } },
    );
    return null;
  }

  return tgUser;
};

/**
 * BOG'LANGAN O'QUVCHINI OLADI — `requireStaff` ning ko'zgusi.
 *
 * @returns {Promise<object|null>} tgUser yoki `null` (javob yuborilgan)
 */
const requireStudent = async (bot, msg) => {
  const chatId = msg.chat.id;
  const tgUser = await getTgUser(msg.from.id.toString());

  if (!tgUser) {
    await sendMessage(bot, chatId, TEXTS.ERROR_NOT_LINKED, getStartKeyboard());
    return null;
  }

  // Yetim qator (`requireStaff` dagi bilan bir xil sabab)
  if (!tgUser.person) {
    await sendMessage(bot, chatId, TEXTS.ERROR_NOT_LINKED, getStartKeyboard());
    return null;
  }

  if (tgUser.kind !== LINK_KIND.STUDENT || !tgUser.student) {
    // Eski klaviaturadagi ota-ona tugmasi — endi xodim sifatida kirgan
    await sendMessage(
      bot,
      chatId,
      TEXTS.SWITCHED_TO_STAFF,
      await keyboardFor(tgUser),
    );
    return null;
  }

  return tgUser;
};

/**
 * BOG'LANGAN ODAMNI OLADI — TURIDAN QAT'I NAZAR.
 *
 * `requireStaff` / `requireStudent` ning uchinchisi: muammo yuborish
 * IKKI OQIMDA HAM bir xil ishlaydi, shuning uchun turni tekshirmaydi.
 * Tekshiriladigan narsa faqat "bog'langanmi va hisobi ochiqmi".
 *
 * @returns {Promise<object|null>} tgUser yoki `null` (javob yuborilgan)
 */
const requireLinked = async (bot, msg) => {
  const chatId = msg.chat.id;
  const tgUser = await getTgUser(msg.from.id.toString());

  // `!tgUser.person` — yetim qator (bog'langan odam o'chirilgan)
  if (!tgUser || !tgUser.person) {
    await sendMessage(bot, chatId, TEXTS.ERROR_NOT_LINKED, getStartKeyboard());
    return null;
  }

  // Yopilgan xodim hisobi — `requireStaff` dagi bilan ayni qoida
  if (tgUser.kind === LINK_KIND.STAFF && !staffFlowOpen(tgUser)) {
    await sendMessage(bot, chatId, TEXTS.STAFF_ACCESS_REVOKED, {
      reply_markup: { remove_keyboard: true },
    });
    return null;
  }

  return tgUser;
};

/** Xodim hodisasini yozadi. */
const trackStaff = (tgUser, action, meta) =>
  track({
    telegramId: tgUser.telegramId,
    userId: tgUser.person.id,
    action: `${STAFF_ACTION}${action}`,
    meta,
  });

/**
 * Muammo hodisasini yozadi — oqimga mos prefiks bilan.
 *
 * ⚠️ OTA-ONADA `studentId`, XODIMDA `userId`. Ikkisi boshqa-boshqa
 * ma'noda (`activity.service#record`): birinchisi "hodisa qaysi o'quvchi
 * haqida", ikkinchisi "kim qildi". Xodim hodisasiga `studentId` yozilsa
 * panelda ota-ona qamrovi ko'rsatkichi buzilardi.
 */
const trackIssue = (tgUser, meta) => {
  if (tgUser.kind === LINK_KIND.STAFF) return trackStaff(tgUser, "issue", meta);

  return track({
    telegramId: tgUser.telegramId,
    studentId: tgUser.student?.id,
    action: "bot.issue",
    meta,
  });
};

/**
 * /start command handler
 */
const handleStart = async (bot, msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();

  // Check if already linked
  const existingTgUser = await getTgUser(telegramId);

  // ── XODIM ──
  if (staffFlowOpen(existingTgUser)) {
    trackStaff(existingTgUser, "start");

    const [roleLabel, keyboard] = await Promise.all([
      staffService.getRoleLabel(existingTgUser.person),
      keyboardFor(existingTgUser),
    ]);

    await sendMessage(
      bot,
      chatId,
      TEXTS.WELCOME_BACK_STAFF(
        escapeMarkdown(fullNameOf(existingTgUser.person)),
        escapeMarkdown(roleLabel),
      ),
      keyboard,
    );
    return;
  }

  // ── OTA-ONA ──
  // `student` yetim qatorda `null` bo'ladi va shox ishlamaydi — pastda
  // foydalanuvchi WELCOME bilan qayta login qilishga yuboriladi.
  if (existingTgUser && existingTgUser.student) {
    track({
      telegramId,
      studentId: existingTgUser.student.id,
      action: "bot.start",
    });

    const studentName = escapeMarkdown(fullNameOf(existingTgUser.student));
    const classNames = escapeMarkdown(
      existingTgUser.student.classes?.map((c) => c.name).join(", ") || "Noma'lum"
    );

    await sendMessage(bot, chatId, 
      `👋 Qaytib kelganingizdan xursandmiz!\n\n📚 O'quvchi: *${studentName}*\n🏫 Sinflar: *${classNames}*`,
      getMainKeyboard()
    );
    return;
  }

  // Yopilgan xodim bog'lanishi — qayta login ham yordam bermaydi
  // (`authenticateUser` arxivlangan hisobni kiritmaydi), shuning uchun
  // WELCOME o'rniga sababni aytamiz.
  if (existingTgUser?.kind === LINK_KIND.STAFF) {
    await sendMessage(bot, chatId, TEXTS.STAFF_ACCESS_REVOKED, {
      reply_markup: { remove_keyboard: true },
    });
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

  try {
    // ⚠️ ROLDAN QAT'I NAZAR: tekshiruv faqat login/parol/faollik bo'yicha,
    // "o'quvchimi?" degan rad etish OLIB TASHLANGAN.
    const authResult = await authenticateUser(username, password);

    if (!authResult.success) {
      const errorMessage =
        authResult.error === "INACTIVE_USER"
          ? TEXTS.AUTH_INACTIVE_USER
          : TEXTS.AUTH_FAILED;

      await sendMessage(bot, chatId, errorMessage, getStartKeyboard());
      return;
    }

    const person = authResult.user;
    const isStaffLogin = authResult.kind === LINK_KIND.STAFF;

    // Oldingi bog'lanish turi — almashganini aytib qo'yish uchun
    const previous = await getTgUser(msg.from.id.toString());

    // Link Telegram user
    const telegramUser = {
      id: msg.from.id,
      chatId: chatId.toString(),
      first_name: msg.from.first_name,
      last_name: msg.from.last_name,
      username: msg.from.username,
    };

    // `authResult.branch` — foydalanuvchi qaysi filialda ekani. `TgUser` o'sha
    // filial bazasiga, yo'naltirgich esa platformaga yoziladi.
    const linkResult = await linkTelegramUser(
      telegramUser,
      person,
      authResult.branch,
      authResult.kind,
    );

    if (!linkResult.success) {
      if (linkResult.error === "ALREADY_LINKED") {
        const tgUser = await getTgUser(msg.from.id.toString());
        await sendMessage(
          bot,
          chatId,
          TEXTS.AUTH_ALREADY_LINKED,
          await keyboardFor(tgUser),
        );
      } else {
        await sendMessage(bot, chatId, TEXTS.ERROR_GENERAL, getStartKeyboard());
      }
      return;
    }

    // Successful link
    // Foydalanuvchi ismi/sinf nomi Markdown'ni buzmasligi uchun escape qilamiz -
    // aks holda AUTH_SUCCESS jimgina yuborilmay, bot "qotib qolgandek" ko'rinadi.
    const personName = escapeMarkdown(fullNameOf(person));

    // ⚠️ `runWithBranch` MAJBURIY va u aynan shu yerda kerak.
    //
    // `registerHandlers` dagi `inBranch()` filialni TELEGRAM ID
    // bo'yicha topadi, login oqimida esa foydalanuvchi hali
    // bog'lanmagan — ya'ni bu handler FILIALSIZ ishlaydi va
    // `track()` jimgina hech narsa yozmasdi. Bog'lanish esa aynan
    // eng muhim hodisa: usiz "bu oy nechta yangi ota-ona ulandi"
    // degan savol javobsiz qolardi.
    //
    // Filial `authResult.branch` da allaqachon ma'lum (`TgUser` ham
    // o'sha yerga yozilgan), shuning uchun hodisani o'sha kontekstda
    // yozamiz.
    runWithBranch(authResult.branch, () =>
      track(
        isStaffLogin
          ? {
              telegramId: msg.from.id.toString(),
              userId: person.id,
              action: `${STAFF_ACTION}link`,
            }
          : {
              telegramId: msg.from.id.toString(),
              studentId: person.id,
              action: "bot.link",
            },
      ),
    );

    // ── XODIM ──
    if (isStaffLogin) {
      const [roleLabel, showLessons] = await Promise.all([
        runWithBranch(authResult.branch, () =>
          staffService.getRoleLabel(person),
        ),
        runWithBranch(authResult.branch, () => staffService.hasLessons(person)),
      ]);

      await sendMessage(
        bot,
        chatId,
        TEXTS.AUTH_SUCCESS_STAFF(personName, escapeMarkdown(roleLabel)),
        getStaffKeyboard(showLessons),
      );

      // Ota-onadan xodimga o'tdi — eski kuzatuv yopilganini aytamiz
      if (previous?.kind === LINK_KIND.STUDENT) {
        await sendMessage(bot, chatId, TEXTS.SWITCHED_TO_STAFF);
      }
      return;
    }

    // ── OTA-ONA ──
    const classNames = escapeMarkdown(
      person.classes?.map((c) => c.name).join(", ") || "Noma'lum"
    );

    await sendMessage(
      bot,
      chatId,
      TEXTS.AUTH_SUCCESS(personName, classNames),
      getMainKeyboard()
    );

    // Xodimdan ota-onaga o'tdi — xodim menyusi yopilganini aytamiz
    if (previous?.kind === LINK_KIND.STAFF) {
      await sendMessage(bot, chatId, TEXTS.SWITCHED_TO_STUDENT);
    }
  } catch (error) {
    // Kutilmagan xato bo'lsa ham foydalanuvchi javobsiz qolmasligi kerak
    console.error("Password handler error:", error);
    await sendMessage(bot, chatId, TEXTS.ERROR_GENERAL, getStartKeyboard());
  } finally {
    clearUserState(chatId);
  }
};

/* ══════════════════════════════════════════════════════════════════════
   OTA-ONA OQIMI
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Today's grades handler
 */
const handleMyGrades = async (bot, msg) => {
  const chatId = msg.chat.id;

  const tgUser = await requireStudent(bot, msg);
  if (!tgUser) return;

  track({
    telegramId: tgUser.telegramId,
    studentId: tgUser.student.id,
    action: "bot.grades",
  });

  const grades = await getStudentGradesByDate(tgUser.student.id, new Date());
  
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
 * Statistics handler
 */
const handleStatistics = async (bot, msg) => {
  const chatId = msg.chat.id;

  const tgUser = await requireStudent(bot, msg);
  if (!tgUser) return;

  track({
    telegramId: tgUser.telegramId,
    studentId: tgUser.student.id,
    action: "bot.statistics",
  });

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

/* ══════════════════════════════════════════════════════════════════════
   XODIM OQIMI

   ⚠️ FAQAT O'ZINING MA'LUMOTI. Har bir so'rov `tgUser.person.id` bo'yicha
   cheklangan, shuning uchun ruxsat tekshiruvi yo'q: xodim o'z davomatiga
   va oyligiga har doim haqli. Boshqa odamning yoki filialning yig'ma
   ko'rsatkichi botga CHIQMAYDI — u bo'lim darajasidagi ruxsatga bog'liq
   (`server/src/utils/permissions.js`) va uni botda ikkinchi marta amalga
   oshirish ruxsat tizimini ikkiga bo'lardi.
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Xodimning bugungi davomati
 */
const handleStaffAttendance = async (bot, msg) => {
  const chatId = msg.chat.id;

  const tgUser = await requireStaff(bot, msg);
  if (!tgUser) return;

  trackStaff(tgUser, "attendance");

  const data = await staffService.getAttendanceToday(tgUser.person);
  await sendMessage(
    bot,
    chatId,
    formatStaffAttendance(data),
    await keyboardFor(tgUser),
  );
};

/**
 * Xodimning topshiriqlari
 */
const handleStaffTasks = async (bot, msg) => {
  const chatId = msg.chat.id;

  const tgUser = await requireStaff(bot, msg);
  if (!tgUser) return;

  trackStaff(tgUser, "tasks");

  const data = await staffService.getTasks(tgUser.person);
  await sendMessage(
    bot,
    chatId,
    formatStaffTasks(data),
    await keyboardFor(tgUser),
  );
};

/**
 * O'qituvchining bugungi darslari
 */
const handleStaffLessons = async (bot, msg) => {
  const chatId = msg.chat.id;

  const tgUser = await requireStaff(bot, msg);
  if (!tgUser) return;

  trackStaff(tgUser, "lessons");

  const date = tashkentDay();
  const data = await staffService.getLessonsToday(tgUser.person, date);

  await sendMessage(
    bot,
    chatId,
    formatStaffLessons(data, date),
    await keyboardFor(tgUser),
  );
};

/**
 * Xodimning oyligi
 */
const handleStaffPayroll = async (bot, msg) => {
  const chatId = msg.chat.id;

  const tgUser = await requireStaff(bot, msg);
  if (!tgUser) return;

  trackStaff(tgUser, "payroll");

  const data = await staffService.getPayroll(tgUser.person);
  await sendMessage(
    bot,
    chatId,
    formatStaffPayroll(data),
    await keyboardFor(tgUser),
  );
};

/* ══════════════════════════════════════════════════════════════════════
   MUAMMO YUBORISH — IKKI OQIMDA HAM BIR XIL

   Ikki qadam: KATEGORIYA tanlanadi (oddiy klaviatura, faqat faol
   kategoriyalar) → matn yoziladi. Kategoriyalar admin panelda sozlanadi,
   botda yaratilmaydi.

   ⚠️ TURI TEKSHIRILMAYDI (`requireLinked`): xodim ham, ota-ona ham
   muammo yuboradi va oqim bir xil. Farq faqat hodisa prefiksida
   (`trackIssue`) va yakunda qaytariladigan klaviaturada.
   ══════════════════════════════════════════════════════════════════════ */

/** Oqimdan chiqish — holat tozalanadi va o'z menyusi qaytariladi. */
const cancelIssue = async (bot, msg) => {
  const chatId = msg.chat.id;
  clearUserState(chatId);

  const tgUser = await getTgUser(msg.from.id.toString());
  await sendMessage(
    bot,
    chatId,
    TEXTS.ISSUE_CANCELLED,
    await keyboardFor(tgUser),
  );
};

/**
 * 1-qadam: kategoriya so'raladi.
 */
const handleIssueStart = async (bot, msg) => {
  const chatId = msg.chat.id;

  const tgUser = await requireLinked(bot, msg);
  if (!tgUser) return;

  const categories = await issueService.getActiveCategories();

  // ⚠️ KATEGORIYA YO'Q — oqim BOSHLANMAYDI. Bo'sh klaviatura bilan
  // "matnni yozing" deyish muammoni kategoriyasiz qoldirardi
  // (`issues.category_id` MAJBURIY).
  if (!categories.length) {
    clearUserState(chatId);
    await sendMessage(
      bot,
      chatId,
      TEXTS.ISSUE_NO_CATEGORIES,
      await keyboardFor(tgUser),
    );
    return;
  }

  setUserState(chatId, { state: STATES.WAITING_ISSUE_CATEGORY });
  await sendMessage(
    bot,
    chatId,
    TEXTS.ISSUE_PICK_CATEGORY,
    getIssueCategoryKeyboard(categories),
  );
};

/**
 * 2-qadam: tanlangan kategoriya qabul qilinadi.
 */
const handleIssueCategory = async (bot, msg, text) => {
  const chatId = msg.chat.id;

  if (text === TEXTS.BTN_ISSUE_CANCEL) {
    await cancelIssue(bot, msg);
    return;
  }

  const tgUser = await requireLinked(bot, msg);
  if (!tgUser) {
    clearUserState(chatId);
    return;
  }

  // ⚠️ KLAVIATURA MIJOZDA QOLADI: kategoriya shu orada o'chirilgan
  // bo'lishi mumkin va eski tugma baribir bosiladi.
  const category = await issueService.findActiveCategoryByName(text);

  if (!category) {
    const categories = await issueService.getActiveCategories();

    if (!categories.length) {
      clearUserState(chatId);
      await sendMessage(
        bot,
        chatId,
        TEXTS.ISSUE_NO_CATEGORIES,
        await keyboardFor(tgUser),
      );
      return;
    }

    await sendMessage(
      bot,
      chatId,
      TEXTS.ISSUE_CATEGORY_UNKNOWN,
      getIssueCategoryKeyboard(categories),
    );
    return;
  }

  setUserState(chatId, {
    state: STATES.WAITING_ISSUE_BODY,
    categoryId: category.id,
    categoryName: category.name,
  });

  await sendMessage(
    bot,
    chatId,
    TEXTS.ISSUE_ENTER_BODY(escapeMarkdown(category.name)),
    getIssueCancelKeyboard(),
  );
};

/**
 * 3-qadam: matn qabul qilinadi va muammo saqlanadi.
 */
const handleIssueBody = async (bot, msg, text) => {
  const chatId = msg.chat.id;
  const { categoryId, categoryName } = getUserState(chatId);

  if (text === TEXTS.BTN_ISSUE_CANCEL) {
    await cancelIssue(bot, msg);
    return;
  }

  const tgUser = await requireLinked(bot, msg);
  if (!tgUser) {
    clearUserState(chatId);
    return;
  }

  // ⚠️ XATOda HOLAT SAQLANADI — odam qayta yozishi kerak, oqim boshidan
  // boshlanmaydi: kategoriyani ikkinchi marta tanlashga majburlash
  // yozilgan matnni ham yo'qotardi.
  const check = issueService.validateBody(text);
  if (!check.ok) {
    await sendMessage(
      bot,
      chatId,
      check.error === "TOO_SHORT"
        ? TEXTS.ISSUE_TOO_SHORT(issueService.BODY_MIN)
        : TEXTS.ISSUE_TOO_LONG(issueService.BODY_MAX),
      getIssueCancelKeyboard(),
    );
    return;
  }

  const issue = await issueService.createIssue({
    tgUser,
    categoryId,
    body: check.body,
  });

  clearUserState(chatId);

  if (!issue) {
    await sendMessage(
      bot,
      chatId,
      TEXTS.ERROR_GENERAL,
      await keyboardFor(tgUser),
    );
    return;
  }

  trackIssue(tgUser, { issueId: issue.id, categoryId });

  await sendMessage(
    bot,
    chatId,
    TEXTS.ISSUE_SENT(escapeMarkdown(issue.category?.name || categoryName)),
    await keyboardFor(tgUser),
  );
};

/* ══════════════════════════════════════════════════════════════════════
   UMUMIY
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Settings handler — ikki oqim uchun ham.
 *
 * ⚠️ XODIMDA BILDIRISHNOMA TUGMASI YO'Q: `notificationsEnabled` faqat
 * KUNLIK BAHO HISOBOTINI boshqaradi va u o'quvchiga bog'langan hisoblarga
 * ketadi (`getActiveNotificationUsers`). Xodimga hisobot yuborilmaydi,
 * ya'ni tugma hech narsani o'zgartirmas edi.
 */
const handleSettings = async (bot, msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();

  const tgUser = await getTgUser(telegramId);

  // `!tgUser.person` — yetim qator (bog'langan odam o'chirilgan)
  if (!tgUser || !tgUser.person) {
    await sendMessage(bot, chatId, TEXTS.ERROR_NOT_LINKED, getStartKeyboard());
    return;
  }

  // ── XODIM ──
  if (tgUser.kind === LINK_KIND.STAFF) {
    if (!staffFlowOpen(tgUser)) {
      await sendMessage(bot, chatId, TEXTS.STAFF_ACCESS_REVOKED, {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    trackStaff(tgUser, "settings");

    await bot.sendMessage(chatId, TEXTS.STAFF_SETTINGS_MENU, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: TEXTS.BTN_UNLINK, callback_data: "unlink" }]],
      },
    });
    return;
  }

  // ── OTA-ONA ──
  track({
    telegramId,
    studentId: tgUser.student?.id,
    action: "bot.settings",
  });

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

    track({
      telegramId,
      action: "bot.notifications",
      meta: { enabled },
    });
    
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
    // ⚠️ Hodisa UZISHDAN OLDIN yoziladi: `unlinkTelegramUser` qatorni
    // o'chiradi va undan keyin `lastActivity` yangilanadigan joy
    // qolmaydi
    const tgUser = await getTgUser(telegramId);

    if (tgUser?.kind === LINK_KIND.STAFF && tgUser.person) {
      trackStaff(tgUser, "unlink");
    } else {
      track({ telegramId, action: "bot.unlink" });
    }

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
    const tgUser = await getTgUser(telegramId);
    await sendMessage(
      bot,
      chatId,
      TEXTS.UNLINK_CANCELLED,
      await keyboardFor(tgUser),
    );
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

  // ⚠️ HOLAT TUGMA MATNIDAN OLDIN TEKSHIRILADI. Login oqimida odam
  // ISTALGAN satrni kiritadi va u tasodifan tugma matniga teng
  // bo'lishi mumkin ("⚙️ Sozlamalar" ni nusxalab qo'yish kifoya):
  // teskari tartibda bot parol so'rab turib menyuga o'tib ketardi va
  // kiritilgan satr parol sifatida HECH QAYERDA ishlatilmay qolardi.
  const userState = getUserState(chatId);

  if (userState.state === STATES.WAITING_USERNAME) {
    await handleUsername(bot, msg, text);
    return;
  }

  if (userState.state === STATES.WAITING_PASSWORD) {
    await handlePassword(bot, msg, text);
    return;
  }

  // ⚠️ MUAMMO HOLATI TUGMALARDAN KEYIN TEKSHIRILADI — login holatlarining
  // TESKARISI, va bu ataylab. Login oqimida odam ISTALGAN satrni kiritadi
  // (parol tugma matniga teng bo'lishi mumkin), muammo oqimida esa menyu
  // tugmasini bosish "oqimni tashlab ketdim" degani: aks holda bosilgan
  // tugmaning MATNI muammo mazmuni bo'lib ketardi ("📨 Muammo yuborish"
  // minimal uzunlikdan oshadi va jimgina saqlanib qolardi).
  //
  // Tugma bosilgan — yarim qolgan oqim tozalanadi, aks holda keyingi
  // yozilgan satr kutilmaganda muammo matni bo'lib ketardi.
  if (MENU_BUTTONS.has(text) && ISSUE_STATES.has(userState.state)) {
    clearUserState(chatId);
  }

  // Check button texts
  if (text === TEXTS.START_BUTTON) {
    await handleStartButton(bot, msg);
    return;
  }

  // ── Ota-ona tugmalari ──
  if (text === TEXTS.BTN_MY_GRADES) {
    await handleMyGrades(bot, msg);
    return;
  }

  if (text === TEXTS.BTN_STATISTICS) {
    await handleStatistics(bot, msg);
    return;
  }

  // ── Xodim tugmalari ──
  if (text === TEXTS.BTN_STAFF_ATTENDANCE) {
    await handleStaffAttendance(bot, msg);
    return;
  }

  if (text === TEXTS.BTN_STAFF_TASKS) {
    await handleStaffTasks(bot, msg);
    return;
  }

  if (text === TEXTS.BTN_STAFF_LESSONS) {
    await handleStaffLessons(bot, msg);
    return;
  }

  if (text === TEXTS.BTN_STAFF_PAYROLL) {
    await handleStaffPayroll(bot, msg);
    return;
  }

  // ── Ikki oqimda ham bir xil ──
  if (text === TEXTS.BTN_SETTINGS) {
    await handleSettings(bot, msg);
    return;
  }

  if (text === TEXTS.BTN_ISSUE) {
    await handleIssueStart(bot, msg);
    return;
  }

  // ── Muammo oqimi ──
  if (userState.state === STATES.WAITING_ISSUE_CATEGORY) {
    await handleIssueCategory(bot, msg, text);
    return;
  }

  if (userState.state === STATES.WAITING_ISSUE_BODY) {
    await handleIssueBody(bot, msg, text);
    return;
  }

  // Tanilmagan matn — bog'lanmagan bo'lsa login taklif qilamiz
  const tgUser = await getTgUser(msg.from.id.toString());
  if (!tgUser) {
    await sendMessage(bot, chatId, TEXTS.ERROR_NOT_LINKED, getStartKeyboard());
  }
};

/**
 * Register all handlers to bot
 */
const registerHandlers = (bot) => {
  // Ushlanmagan rejection jarayonni o'chirib yubormasligi uchun har bir
  // handler xatosini shu yerda ushlaymiz (aks holda bot butunlay "qotib" qoladi).
  const safe = (promise, label) =>
    Promise.resolve(promise).catch((error) => {
      console.error(`❌ ${label} error:`, error);
    });

  /**
   * FILIAL KONTEKSTINI YOQADI — serverdagi `auth.middleware` bilan bir xil rol.
   *
   * Telegram ID → qaysi filial (platformadagi yo'naltirgich), so'ng butun
   * handler o'sha kontekstda bajariladi. Shundan keyin `getStudentGradesByDate`,
   * `toggleNotifications`, `staff.service` dagi so'rovlar to'g'ri filial
   * bazasiga boradi — ularning o'zini o'zgartirish shart emas.
   *
   * Hali bog'lanmagan foydalanuvchida filial YO'Q: login oqimi
   * (`handleUsername`/`handlePassword`) filialni username bo'yicha o'zi
   * aniqlaydi.
   */
  const inBranch = async (telegramId, fn) => {
    const branch = telegramId
      ? await resolveBranchByTelegramId(telegramId)
      : null;
    return branch ? runWithBranch(branch, fn) : fn();
  };

  // /start command
  bot.onText(/\/start/, (msg) =>
    safe(
      inBranch(msg.from?.id?.toString(), () => handleStart(bot, msg)),
      "Start handler",
    ),
  );

  // All messages
  bot.on("message", (msg) => {
    if (msg.text && !msg.text.startsWith("/")) {
      safe(
        inBranch(msg.from?.id?.toString(), () => handleMessage(bot, msg)),
        "Message handler",
      );
    }
  });

  // Callback queries
  bot.on("callback_query", (query) =>
    safe(
      inBranch(query.from?.id?.toString(), () => handleCallbackQuery(bot, query)),
      "Callback handler",
    ),
  );

  console.log("📝 Bot handlers registered");
};

module.exports = {
  registerHandlers,
  handleStart,
  handleMessage,
  handleCallbackQuery,
};
