/**
 * XODIM TEZKOR MA'LUMOTI — botdagi "xodim" oqimining ma'lumot qatlami.
 *
 * Botga endi o'quvchi logini bilan ota-ona, xodim logini bilan esa xodimning
 * O'ZI kiradi. Xodimga panelning qisqartmasi emas, TEZKOR javoblar kerak:
 *
 *   davomat    — "bugun keldimmi, kechikdimmi, ketdimmi"
 *   topshiriq  — "nechta ish qoldi, qaysi biri bugun bitishi kerak"
 *   darslar    — "bugun nechta darsim bor, qaysi biriga baho qo'ymadim"
 *   oylik      — "bu oy qancha hisoblandi, qanchasi to'landi"
 *
 * ── QOIDALAR ─────────────────────────────────────────────────────────
 *
 * ⚠️ FAQAT O'QIYDI. Bot davomat belgilamaydi, topshiriq yakunlamaydi,
 * oylik hisoblamaydi: bu qoidalar serverda (`attendance.service`,
 * `task.service`, payroll dvigeteli) va ularni botda takrorlash ikkita
 * haqiqat manbasini yaratardi. Botdan "Men keldim" bosish kerak bo'lsa,
 * u server endpoint'i orqali qilinadi, to'g'ridan-to'g'ri bazaga emas.
 *
 * ⚠️ FAQAT O'ZINING MA'LUMOTI. Har so'rov `userId` bo'yicha qatsiy
 * cheklangan, shuning uchun bu yerda RUXSAT tekshiruvi yo'q — xodim
 * o'zining davomatiga va oyligiga har doim haqli. Boshqa odamning yoki
 * filialning yig'ma ko'rsatkichi botga CHIQMAYDI: u bo'lim darajasidagi
 * ruxsatga bog'liq (`server/src/utils/permissions.js`) va uni botda
 * ikkinchi marta amalga oshirish ruxsat tizimini ikkiga bo'lardi.
 *
 * ⚠️ SANA KOORDINATASI — Toshkent kuni, UTC yarim tunida. Serverdagi
 * `attendance.service#getTodayNormalized` va `month.helpers#currentDayDate`
 * bilan AYNI hisob: `attendances.date` va `grades.date` ustunlari aynan
 * shunday yoziladi, shuning uchun taqqoslash DIAPAZON bilan emas,
 * TENGLIK bilan ketadi.
 */

const prisma = require("../config/prisma");
const { platformPrisma } = require("../config/branch");
const { tashkentDay } = require("./activity.service");
const { getDayNameInUzbek } = require("./schedule.service");

/** Bog'lanish turi — `auth.service.js#LINK_KIND` bilan bir xil. */
const STUDENT_ROLE = "student";

/**
 * JORIY OY KALITI — YYYYMM, Toshkent vaqti bo'yicha.
 * Serverdagi `month.helpers#currentMonthKey` bilan ayni hisob.
 * @returns {number}
 */
const currentMonthKey = () => {
  const now = new Date();
  const tashkent = new Date(
    now.getTime() + now.getTimezoneOffset() * 60000 + 5 * 3600000,
  );
  return tashkent.getFullYear() * 100 + (tashkent.getMonth() + 1);
};

/**
 * Odamning BARCHA rollari — asosiy birinchi, keyin qo'shimchalari.
 * Serverdagi `permissions.js#allRoles` ning ko'zgusi.
 * @param {{role?: string, extraRoles?: string[]}} person
 * @returns {string[]}
 */
const allRoles = (person) => {
  if (!person) return [];
  const extra = Array.isArray(person.extraRoles) ? person.extraRoles : [];
  return [...new Set([person.role, ...extra].filter(Boolean))];
};

/**
 * Xodimmi? Rollar DINAMIK (platformadagi `Role` jadvali), shuning uchun
 * ro'yxat kodga qotirilmaydi: "o'quvchi EMAS" = xodim.
 * @param {{role?: string}} person
 * @returns {boolean}
 */
const isStaff = (person) => Boolean(person) && person.role !== STUDENT_ROLE;

/**
 * Decimal → son. Prisma `Decimal` qaytaradi, xabarda esa son kerak.
 * @param {*} value
 * @returns {number}
 */
const num = (value) => (value == null ? 0 : Number(value));

/**
 * ROL YORLIG'I — "O'qituvchi, Kassir" ko'rinishida.
 *
 * ⚠️ NOMLAR PLATFORMADAN O'QILADI, kodga qotirilmaydi: rollar dinamik
 * (`Role` jadvali) va har o'rnatishda boshqacha nomlangan bo'lishi
 * mumkin. Topilmagan rol `value` ning o'zi bilan ko'rsatiladi — bo'sh
 * satr qoldirgandan ko'ra "reception" ham foydaliroq.
 *
 * @param {object} person
 * @returns {Promise<string>}
 */
const getRoleLabel = async (person) => {
  const values = allRoles(person);
  if (values.length === 0) return "Xodim";

  const rows = await platformPrisma.role.findMany({
    where: { value: { in: values } },
    select: { value: true, name: true },
  });
  const names = new Map(rows.map((r) => [r.value, r.name]));

  // Tartib `allRoles` dagidek qoladi — ASOSIY rol birinchi turishi kerak.
  return values.map((v) => names.get(v) || v).join(", ");
};

// ─────────────────────────────────────────────
// DAVOMAT
// ─────────────────────────────────────────────

/**
 * AMALDAGI ISH VAQTI — xodimda qo'yilmagan bo'lsa ROL standarti.
 *
 * Serverdagi `user.service.js#effectiveSchedule` bilan ayni qoida.
 * `workTimeSource = "schedule"` bo'lsa `null` qaytadi: o'sha holatda vaqt
 * dars jadvalidan hisoblanadi (`summarizeWeek`) va uni botda takrorlash
 * ikkinchi haqiqat manbasini yaratardi — vaqt satri shunchaki
 * ko'rsatilmaydi, davomat hukmi (`isLate`, `lateMinutes`) esa baribir
 * serverdan keladi va o'z kuchida qoladi.
 *
 * @param {object} person
 * @returns {Promise<{startTime: string, endTime: string}|null>}
 */
const getEffectiveWorkTime = async (person) => {
  if (person.workTimeSource === "schedule") return null;

  if (person.workStartTime && person.workEndTime) {
    return { startTime: person.workStartTime, endTime: person.workEndTime };
  }

  const role = await platformPrisma.role.findFirst({
    where: { value: person.role },
    select: { workStartTime: true, workEndTime: true },
  });

  if (role?.workStartTime && role?.workEndTime) {
    return { startTime: role.workStartTime, endTime: role.workEndTime };
  }

  return null;
};

/**
 * Bugungi davomat + amaldagi ish vaqti.
 *
 * @param {object} person - `getTgUser().person`
 * @returns {Promise<{record: object|null, workTime: object|null, date: Date}>}
 */
const getAttendanceToday = async (person) => {
  const date = tashkentDay();

  const [record, workTime] = await Promise.all([
    prisma.attendance.findUnique({
      where: { userId_date: { userId: person.id, date } },
    }),
    getEffectiveWorkTime(person),
  ]);

  return { record, workTime, date };
};

// ─────────────────────────────────────────────
// TOPSHIRIQLAR
// ─────────────────────────────────────────────

/**
 * OCHIQ holatlar — ijrochidan hali HARAKAT kutilayotganlari.
 *
 * `pending_review` KIRMAYDI: ish topshirilgan va to'p rahbariyatda, xodim
 * uchun u "qilinishi kerak" emas (alohida sanaladi). `completed` va
 * `stopped` — yakuniy holatlar.
 */
const OPEN_TASK_STATUSES = ["pending", "extended", "pending_rejected"];

/**
 * Xodimning topshiriqlari — ochiqlari, ko'rib chiqilayotgani va jarima bali.
 *
 * @param {object} person
 * @returns {Promise<{open: Array, reviewCount: number, overdue: Array, penaltyPoints: number}>}
 */
const getTasks = async (person) => {
  const now = new Date();

  const [open, reviewCount] = await Promise.all([
    prisma.task.findMany({
      where: { assignee: person.id, status: { in: OPEN_TASK_STATUSES } },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        penaltyPoints: true,
      },
    }),
    prisma.task.count({
      where: { assignee: person.id, status: "pending_review" },
    }),
  ]);

  return {
    open,
    reviewCount,
    overdue: open.filter((task) => task.dueDate < now),
    // Jonli o'qiladi: `getTgUser` paytidagi qiymat eskirgan bo'lishi mumkin
    penaltyPoints: person.penaltyPoints ?? 0,
  };
};

// ─────────────────────────────────────────────
// DARSLAR (o'qituvchi)
// ─────────────────────────────────────────────

/**
 * Xodimda dars jadvali BORMI — xodim menyusida "Darslarim" tugmasi
 * ko'rinishini shu hal qiladi.
 *
 * ⚠️ ROL NOMIGA EMAS, MA'LUMOTGA QARAYDI. Rollar dinamik: o'qituvchi
 * roli boshqa nom bilan yaratilgan bo'lishi mumkin, qo'shimcha rol
 * (`extraRoles`) bilan dars beradigan ma'muriyat xodimi ham bor. Jadvalda
 * darsi bo'lsa — tugma kerak, bo'lmasa kerak emas.
 *
 * @param {object} person
 * @returns {Promise<boolean>}
 */
const hasLessons = async (person) => {
  const count = await prisma.scheduleLesson.count({
    where: { teacherId: person.id },
  });
  return count > 0;
};

/**
 * Bugungi darslar + har biriga baho qo'yilgan-qo'yilmagani.
 *
 * "Baho qo'yilgan" belgisi `Grade` dagi (sinf + fan + dars tartibi)
 * uchligiga qarab aniqlanadi — panelda ham shu uchlik bitta darsni
 * bildiradi (`grades` jadvalidagi `lesson_order`).
 *
 * @param {object} person
 * @param {Date} [date]
 * @returns {Promise<{dayName: string, lessons: Array, gradedCount: number}>}
 */
const getLessonsToday = async (person, date = tashkentDay()) => {
  // ⚠️ HAFTA KUNI TOSHKENT SANASIDAN. `getDayNameInUzbek` mahalliy
  // `getDay()` ga tayanadi, `tashkentDay()` esa kunni UTC YARIM TUNIDA
  // qaytaradi — bot UTC'dan orqadagi zonada ishlasa yarim tun oldingi
  // kunga tushib, jadval bir kunga siljirdi. Shuning uchun o'sha kunning
  // SOAT 12:00 i beriladi: tush payti UTC-11..UTC+11 oralig'idagi har
  // qanday zonada ayni o'sha kun bo'lib qoladi.
  const dayName = getDayNameInUzbek(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12)),
  );

  if (dayName === "yakshanba") {
    return { dayName, lessons: [], gradedCount: 0 };
  }

  const rows = await prisma.scheduleLesson.findMany({
    where: { teacherId: person.id, schedule: { day: dayName } },
    orderBy: { order: "asc" },
    select: {
      id: true,
      subjectId: true,
      order: true,
      startTime: true,
      endTime: true,
      schedule: { select: { classId: true } },
    },
  });

  if (rows.length === 0) {
    return { dayName, lessons: [], gradedCount: 0 };
  }

  // classId / subjectId — scalar (relation yo'q), nomlarni qo'lda yuklaymiz
  const classIds = [...new Set(rows.map((r) => r.schedule.classId))];
  const subjectIds = [...new Set(rows.map((r) => r.subjectId).filter(Boolean))];

  const [classes, subjects, grades] = await Promise.all([
    prisma.class.findMany({
      where: { id: { in: classIds } },
      select: { id: true, name: true },
    }),
    prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true },
    }),
    // ⚠️ DIAPAZON, TENGLIK EMAS — va bu `attendances.date` dan FARQ
    // qiladi.
    //
    // Davomat qatorida `date` har doim UTC yarim tunida yotadi
    // (`normalizeDateTashkent`), shuning uchun u tenglik bilan topiladi.
    // `grades.date` esa BIR XIL EMAS: yangi qatorlar yarim tunda
    // (`resolveGradingDay` → `currentDayDate`), eski qatorlarda esa
    // yaratilish instanti turadi (bazada 06:07:27, 10:38:17 kabi
    // qiymatlar — Toshkent dars vaqtining UTC ko'rinishi). Tenglik bilan
    // qidirsak eski qatorlar HECH QACHON topilmay, "baho qo'yilgan"
    // belgisi doim bo'sh ko'rinardi.
    //
    // Kun chegarasi: [D 00:00Z, D+1 00:00Z). Baho dars vaqtida qo'yiladi
    // (Toshkent 08:00–20:00 → UTC 03:00–15:00, ayni shu kun ichida),
    // shuning uchun diapazon ikkala shaklni ham qamrab oladi.
    // Botdagi `getStudentGradesByDate` ham kun chegarasi bilan ishlaydi.
    prisma.grade.findMany({
      where: {
        teacherId: person.id,
        date: { gte: date, lt: new Date(date.getTime() + 24 * 3600 * 1000) },
      },
      select: { classId: true, subjectId: true, lessonOrder: true },
    }),
  ]);

  const classNames = new Map(classes.map((c) => [c.id, c.name]));
  const subjectNames = new Map(subjects.map((s) => [s.id, s.name]));
  const gradedKeys = new Set(
    grades.map((g) => `${g.classId}_${g.subjectId}_${g.lessonOrder}`),
  );

  const lessons = rows.map((row) => {
    const classId = row.schedule.classId;
    return {
      classId,
      className: classNames.get(classId) || "Noma'lum sinf",
      subjectName: subjectNames.get(row.subjectId) || "Noma'lum fan",
      order: row.order,
      startTime: row.startTime,
      endTime: row.endTime,
      graded: gradedKeys.has(`${classId}_${row.subjectId}_${row.order}`),
    };
  });

  return {
    dayName,
    lessons,
    gradedCount: lessons.filter((l) => l.graded).length,
  };
};

// ─────────────────────────────────────────────
// OYLIK
// ─────────────────────────────────────────────

/**
 * Oylik qatori — joriy oy, bo'lmasa oxirgi mavjud oy.
 *
 * ⚠️ JORIY OY ODATDA HALI YO'Q: `payroll_entries` oy YAKUNIDA
 * generatsiya qilinadi. Shu sababli qator topilmasa jim bo'sh qaytarmaymiz,
 * balki oxirgi mavjud oyni ko'rsatamiz va qaysi oy ekanini aytamiz — aks
 * holda xodim "oyligim yo'q" degan xulosaga kelardi.
 *
 * ⚠️ Summalar MUHRLANGAN (hisob-faktura doktrinasi): toifa yoki jadval
 * keyin o'zgarsa bu qator qayta hisoblanmaydi.
 *
 * @param {object} person
 * @returns {Promise<{entry: object|null, isCurrentMonth: boolean, monthKey: number}>}
 */
const getPayroll = async (person) => {
  const monthKey = currentMonthKey();

  const select = {
    month: true,
    amount: true,
    paidAmount: true,
    status: true,
    salaryType: true,
    fixedAmount: true,
    allowanceAmount: true,
    kpiAmount: true,
    lessonHours: true,
    deductionAmount: true,
    suspendedAmount: true,
    absenceAmount: true,
    categoryName: true,
    positionName: true,
    cancelledAt: true,
    paidAt: true,
  };

  const current = await prisma.payrollEntry.findUnique({
    where: { staffId_month: { staffId: person.id, month: monthKey } },
    select,
  });

  if (current) {
    return { entry: current, isCurrentMonth: true, monthKey };
  }

  const latest = await prisma.payrollEntry.findFirst({
    where: { staffId: person.id },
    orderBy: { month: "desc" },
    select,
  });

  return { entry: latest, isCurrentMonth: false, monthKey };
};

module.exports = {
  STUDENT_ROLE,
  currentMonthKey,
  allRoles,
  isStaff,
  num,
  getRoleLabel,
  getEffectiveWorkTime,
  getAttendanceToday,
  getTasks,
  hasLessons,
  getLessonsToday,
  getPayroll,
  OPEN_TASK_STATUSES,
};
