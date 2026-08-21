const { platformPrisma, listBranches, getClientForSchema } = require("./branch");

/**
 * Platformaga ulanadi va filiallar reyestrini o'qiydi.
 *
 * FILIAL ULANISHLARI LAZY: bot birinchi murojaatda o'sha filialning
 * client'ini ochadi. Bu yerda faqat startup'da hech bo'lmasa bitta
 * ishlaydigan filial borligi tekshiriladi — aks holda bot jimgina
 * "hech kim topilmadi" deb ishlab yuraverardi.
 */
const connectDB = async () => {
  try {
    await platformPrisma.$connect();
    console.log("✅ PostgreSQL (platforma) connected");
  } catch (error) {
    console.error(`❌ Platform DB connection error: ${error.message}`);
    process.exit(1);
  }

  let branches = [];
  try {
    branches = await listBranches();
  } catch (error) {
    console.error(`❌ Filiallar reyestri o'qilmadi: ${error.message}`);
    process.exit(1);
  }

  if (branches.length === 0) {
    console.error(
      "❌ Ishlaydigan filial yo'q. Server tomonida `npm run branch:bootstrap` ni ishga tushiring.",
    );
    process.exit(1);
  }

  // Default filialga darhol ulanamiz — ulanish xatosi startup'da chiqsin,
  // birinchi kelgan xabarda emas.
  try {
    await getClientForSchema(branches[0].schemaName).$connect();
  } catch (error) {
    console.error(`❌ Filial bazasiga ulanib bo'lmadi: ${error.message}`);
    process.exit(1);
  }

  console.log(
    `✅ ${branches.length} ta filial: ${branches.map((b) => b.name).join(", ")}`,
  );
};

module.exports = connectDB;
