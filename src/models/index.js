// Export all models from one place
const User = require("./user.model");
const TgUser = require("./tguser.model");
const Grade = require("./grade.model");
const Subject = require("./subject.model");
const Class = require("./class.model");
const Holiday = require("./holiday.model");

module.exports = { User, TgUser, Grade, Subject, Class, Holiday };
