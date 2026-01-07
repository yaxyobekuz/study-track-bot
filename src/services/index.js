// Export services
const authService = require("./auth.service");
const gradeService = require("./grade.service");
const messageService = require("./message.service");

module.exports = { ...authService, ...gradeService, ...messageService };
