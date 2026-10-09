// Xabar matnlari

const TEXTS = {
  // Salomlashish va umumiy
  WELCOME: `👋 Assalomu alaykum!

Bu bot ikki xil ishlaydi:

👨‍👩‍👦 *Ota-ona* — o'quvchining login va paroli bilan kirsangiz,
farzandingizning kunlik baholarini kuzatasiz.

👔 *Xodim* — o'z login va parolingiz bilan kirsangiz, davomatingiz,
topshiriqlaringiz va oyligingiz ko'rinadi.

Davom etish uchun login va parolni kiriting.`,

  START_BUTTON: "🚀 Boshlash",

  // Autentifikatsiya
  // ⚠️ "O'quvchining" deb aytilmaydi: bu yerga xodim ham o'z loginini
  // kiritadi va eski matn uni to'xtatib qo'yardi.
  ENTER_USERNAME: "👤 Login (username)ni kiriting:",
  ENTER_PASSWORD: "🔐 Parolni kiriting:",

  AUTH_SUCCESS: (studentName, classNames) =>
    `✅ Muvaffaqiyatli ro'yxatdan o'tdingiz!

📚 O'quvchi: ${studentName}
🏫 Sinflar: ${classNames}

Endi har kuni belgilangan vaqtda farzandingizning baholarini olasiz.`,

  AUTH_FAILED: "❌ Login yoki parol noto'g'ri. Qaytadan urinib ko'ring.",
  AUTH_ALREADY_LINKED: "⚠️ Siz allaqachon shu hisobga bog'langansiz.",
  AUTH_INACTIVE_USER: "❌ Bu foydalanuvchi faol emas.",

  // Xodim kirishi
  AUTH_SUCCESS_STAFF: (name, roleLabel) =>
    `✅ Xush kelibsiz!

👔 Xodim: ${name}
🏷 Lavozim: ${roleLabel}

Pastdagi menyudan o'zingizga tegishli ma'lumotlarni ko'rishingiz mumkin.`,

  WELCOME_BACK_STAFF: (name, roleLabel) =>
    `👋 Qaytib kelganingizdan xursandmiz!\n\n👔 Xodim: *${name}*\n🏷 Lavozim: *${roleLabel}*`,

  // ⚠️ Bitta Telegram = bitta bog'lanish. Farzandi shu maktabda o'qiydigan
  // xodim o'quvchi logini bilan kirsa, xodim bog'lanishi ALMASHADI — buni
  // jim qilmaslik kerak, aks holda u menyusi nega o'zgarganini bilmaydi.
  SWITCHED_TO_STUDENT:
    "ℹ️ Endi siz *ota-ona* sifatida kirgansiz — xodim menyusi yopildi.\nXodim menyusiga qaytish uchun o'z loginingiz bilan qayta kiring.",
  SWITCHED_TO_STAFF:
    "ℹ️ Endi siz *xodim* sifatida kirgansiz — o'quvchi kuzatuvi yopildi.\nO'quvchi baholarini ko'rish uchun o'quvchi logini bilan qayta kiring.",

  // Kunlik hisobot
  DAILY_REPORT_HEADER: (studentName, date) =>
    `📊 *Kunlik baho hisoboti*\n\n👤 O'quvchi: *${studentName}*\n📅 Sana: *${date}*\n`,

  GRADE_LINE: (subjectName, grade, comment) => {
    const gradeEmoji = {
      5: "⭐",
      4: "👍",
      3: "😐",
      2: "😟",
    };
    let line = `${gradeEmoji[grade] || "📝"} *${subjectName}*: ${grade}`;
    if (comment) {
      line += ` _(${comment})_`;
    }
    return line;
  },

  NO_GRADE_LINE: (subjectName) => `❌ *${subjectName}*: Darsda qatnashmadi`,

  NO_GRADES_TODAY: (studentName, date) =>
    `📭 *Kunlik hisobot*\n\n👤 O'quvchi: *${studentName}*\n📅 Sana: *${date}*\n\n⚠️ Bugun o'quvchiga baho qo'yilmadi.\n\n_Bu o'quvchi bugun maktabga kelmagan bo'lishi mumkin yoki darslar o'tkazilmagan._`,

  // Tugmalar
  BTN_MY_GRADES: "📊 Bugungi baholar",
  BTN_SETTINGS: "⚙️ Sozlamalar",
  BTN_STATISTICS: "📈 Statistika",
  BTN_UNLINK: "🔓 Bog'lanishni bekor qilish",
  BTN_WEB_APP: "» Web Sahifani Ochish «",

  // ── XODIM TUGMALARI ─────────────────────────────────────────
  // ⚠️ Matnlar O'QUVCHI tugmalaridan farq qilishi SHART: handler kelgan
  // xabarni aynan shu satrlar bilan solishtiradi, ikkita menyuda bir xil
  // satr bo'lsa xodimga o'quvchi oqimi ochilib ketardi.
  BTN_STAFF_ATTENDANCE: "🕒 Davomatim",
  BTN_STAFF_TASKS: "📋 Topshiriqlarim",
  BTN_STAFF_LESSONS: "📚 Bugungi darslarim",
  BTN_STAFF_PAYROLL: "💰 Oyligim",

  // ── XODIM: DAVOMAT ──────────────────────────────────────────
  STAFF_ATTENDANCE_HEADER: (date) => `🕒 *Davomat*\n📅 Sana: *${date}*\n`,

  STAFF_WORK_TIME: (start, end) => `🏢 Ish vaqti: *${start} – ${end}*`,

  STAFF_ATTENDANCE_NONE:
    "⚪ Bugun davomat belgilanmagan.\n\n_Kelganingiz tizimda qayd etilmagan bo'lishi mumkin._",

  STAFF_ATTENDANCE_STATUS: {
    present: "✅ Holat: *Keldi*",
    late: "🟡 Holat: *Kechikdi*",
    absent: "🔴 Holat: *Kelmadi*",
    excused: "🔵 Holat: *Sababli*",
  },

  STAFF_CHECK_IN: (time) => `🚪 Kelgan vaqt: *${time}*`,
  STAFF_CHECK_OUT: (time) => `🏁 Ketgan vaqt: *${time}*`,
  STAFF_CHECK_OUT_PENDING: "🏁 Ketish: _hali belgilanmagan_",
  STAFF_LATE_MINUTES: (minutes) => `⏰ Kechikish: *${minutes} daqiqa*`,
  STAFF_EARLY_OUT_MINUTES: (minutes) => `🏃 Erta ketish: *${minutes} daqiqa*`,
  STAFF_EXCUSE_REASON: (reason) => `📝 Sabab: _${reason}_`,

  // ── XODIM: TOPSHIRIQLAR ─────────────────────────────────────
  STAFF_TASKS_HEADER: "📋 *Topshiriqlarim*\n",
  STAFF_TASKS_EMPTY:
    "✅ Bajarilishi kerak topshiriq yo'q.\n\n_Yaxshi ish!_",

  STAFF_TASK_LINE: (title, dueLabel, overdue) =>
    `${overdue ? "🔴" : "⬜"} *${title}*\n     └ muddati: ${dueLabel}${overdue ? " _(o'tib ketgan)_" : ""}`,

  STAFF_TASKS_OVERDUE_WARN: (count) =>
    `\n⚠️ *${count} ta* topshiriq muddati o'tib ketgan.`,

  STAFF_TASKS_REVIEW: (count) =>
    `\n👀 Ko'rib chiqilmoqda: *${count} ta*`,

  STAFF_PENALTY_POINTS: (points) => `\n🔴 Jarima bali: *${points}*`,

  // ── XODIM: DARSLAR ──────────────────────────────────────────
  STAFF_LESSONS_HEADER: (dayName, date) =>
    `📚 *Bugungi darslarim*\n📅 ${date} (${dayName})\n`,

  STAFF_LESSONS_EMPTY: "📭 Bugun darsingiz yo'q.",

  STAFF_LESSON_LINE: (order, className, subjectName, timeLabel, graded) =>
    `${graded ? "✅" : "⬜"} *${order}-dars* · ${className} · ${subjectName}${timeLabel ? `\n     └ ${timeLabel}` : ""}`,

  STAFF_LESSONS_SUMMARY: (graded, total) =>
    `\n📊 Baho qo'yilgan: *${graded}/${total}*` +
    (graded < total ? `\n⬜ — baho qo'yilmagan dars` : ""),

  // ── XODIM: OYLIK ────────────────────────────────────────────
  STAFF_PAYROLL_HEADER: (monthLabel) => `💰 *Oylik*\n📅 Davr: *${monthLabel}*\n`,

  // ⚠️ Joriy oy qatori oy YAKUNIDA generatsiya qilinadi, shuning uchun
  // odatda oxirgi mavjud oy ko'rsatiladi va buni aytib qo'yish kerak.
  STAFF_PAYROLL_NOT_CURRENT:
    "\n_Joriy oy uchun oylik hali hisoblanmagan — oxirgi hisoblangan oy ko'rsatilgan._",

  STAFF_PAYROLL_EMPTY:
    "📭 Sizda hali hisoblangan oylik yo'q.\n\n_Oylik oy yakunida hisoblanadi._",

  STAFF_PAYROLL_CANCELLED: "🚫 *Bu oylik bekor qilingan.*",

  STAFF_PAYROLL_STATUS: {
    unpaid: "🔴 Holat: *To'lanmagan*",
    partial: "🟡 Holat: *Qisman to'langan*",
    paid: "✅ Holat: *To'langan*",
    cancelled: "🚫 Holat: *Bekor qilingan*",
  },

  STAFF_PAYROLL_TOTAL: (sum) => `💵 Hisoblangan: *${sum}*`,
  STAFF_PAYROLL_PAID: (sum) => `✅ To'langan: *${sum}*`,
  STAFF_PAYROLL_REMAINING: (sum) => `⏳ Qoldiq: *${sum}*`,
  STAFF_PAYROLL_FIXED: (sum) => `  • Asosiy: ${sum}`,
  STAFF_PAYROLL_KPI: (sum, hours) =>
    `  • Soatbay: ${sum}${hours ? ` (${hours} soat)` : ""}`,
  STAFF_PAYROLL_ALLOWANCE: (sum) => `  • Ustamalar: ${sum}`,
  STAFF_PAYROLL_DEDUCTION: (sum) => `  • Ushlab qolindi: −${sum}`,
  STAFF_PAYROLL_ABSENCE: (sum) => `  • Kelmagan kunlar: −${sum}`,
  STAFF_PAYROLL_SUSPENDED: (sum) => `  • To'xtatilgan: −${sum}`,
  STAFF_PAYROLL_BREAKDOWN_HEADER: "\n🧾 *Tarkibi:*",
  STAFF_PAYROLL_POSITION: (name) => `🏷 Lavozim: *${name}*`,
  STAFF_PAYROLL_CATEGORY: (name) => `🎓 Toifa: *${name}*`,

  // ── XODIM: SOZLAMALAR ───────────────────────────────────────
  STAFF_SETTINGS_MENU: `⚙️ *Sozlamalar*

Hisobingiz bu Telegram akkauntiga bog'langan.`,

  STAFF_NO_DATA: "📭 Ma'lumot topilmadi.",

  // ⚠️ Arxivlangan/faolsiz xodim. Login oqimi uni allaqachon to'xtatadi,
  // lekin MAVJUD bog'lanish o'z-o'zidan uzilmaydi: ishdan ketgan odam
  // botdan oylik va topshiriqlarini ko'rib turmasligi kerak.
  STAFF_ACCESS_REVOKED:
    "🔒 Hisobingiz faol emas — ma'lumotlarga kirish yopilgan.\n\nSavollar bo'lsa ma'muriyatga murojaat qiling.",

  // Sozlamalar
  SETTINGS_MENU: `⚙️ *Sozlamalar*

Quyidagi sozlamalarni o'zgartirishingiz mumkin:`,

  NOTIFICATIONS_ON: "✅ Bildirishnomalar yoqilgan",
  NOTIFICATIONS_OFF: "❌ Bildirishnomalar o'chirilgan",
  TOGGLE_NOTIFICATIONS: "🔔 Bildirishnomalarni o'zgartirish",

  // Statistika
  STATISTICS_TEXT: `📈 *Statistika*

Siz o'quvchining haftalik statistikasini ko'rish uchun quyidagi tugmani ezishingiz mumkin. Platformaga kirish uchun o'quvchining login va parolini kiritish talab etiladi! 👇`,

  // Xatolar
  ERROR_GENERAL: "❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
  ERROR_NOT_LINKED:
    "⚠️ Siz hali hech qanday o'quvchiga bog'lanmagansiz. /start buyrug'ini yuboring.",

  // Tasdiqlash
  UNLINK_CONFIRM: "❓ Rostdan ham bog'lanishni bekor qilmoqchimisiz?",
  UNLINK_SUCCESS:
    "✅ Bog'lanish bekor qilindi. Qayta bog'lanish uchun /start buyrug'ini yuboring.",
  UNLINK_CANCELLED: "❌ Bekor qilindi.",

  // Hisobot yuborish
  SENDING_REPORTS: "📤 Kunlik hisobotlar yuborilmoqda...",
  REPORTS_SENT: (sent, failed) =>
    `✅ Hisobotlar yuborildi.\n\nYuborildi: ${sent}\nXatolik: ${failed}`,

  // Jarimalar
  PENALTY_NOTIFICATION: (studentName, title, points, description, totalPoints) => {
    let text = `⚠️ <b>Jarima xabarnomasi</b>\n\n`;
    text += `👤 O'quvchi: <b>${studentName}</b>\n`;
    text += `📋 Sabab: <b>${title}</b>\n`;
    text += `🔴 Ball: <b>${points}</b>\n`;
    if (description) {
      text += `📝 Izoh: ${description}\n`;
    }
    text += `\n📊 Jami jarima bali: <b>${totalPoints}</b>`;
    if (totalPoints >= 12) {
      text += `\n\n🚫 <b>Diqqat!</b> Jarima bali 12 ga yetdi. Profil bloklandi.`;
    } else if (totalPoints > 3) {
      text += `\n\n⚠️ Do'kondan foydalanish cheklangan (jarima bali 3 dan yuqori).`;
    }
    return text;
  },
};

module.exports = TEXTS;
