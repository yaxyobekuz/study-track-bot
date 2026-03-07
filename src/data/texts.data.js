// Xabar matnlari

const TEXTS = {
  // Salomlashish va umumiy
  WELCOME: `👋 Assalomu alaykum!

Bu bot orqali farzandingizning kunlik baholarini kuzatishingiz mumkin.

Davom etish uchun o'quvchining login va parolini kiriting.`,

  START_BUTTON: "🚀 Boshlash",

  // Autentifikatsiya
  ENTER_USERNAME: "👤 O'quvchining login (username)ini kiriting:",
  ENTER_PASSWORD: "🔐 O'quvchining parolini kiriting:",

  AUTH_SUCCESS: (studentName, classNames) =>
    `✅ Muvaffaqiyatli ro'yxatdan o'tdingiz!

📚 O'quvchi: ${studentName}
🏫 Sinflar: ${classNames}

Endi har kuni belgilangan vaqtda farzandingizning baholarini olasiz.`,

  AUTH_FAILED: "❌ Login yoki parol noto'g'ri. Qaytadan urinib ko'ring.",
  AUTH_STUDENT_ONLY: "❌ Faqat o'quvchi ma'lumotlari bilan kirish mumkin.",
  AUTH_ALREADY_LINKED: "⚠️ Siz allaqachon bu o'quvchiga bog'langansiz.",
  AUTH_INACTIVE_USER: "❌ Bu foydalanuvchi faol emas.",

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
