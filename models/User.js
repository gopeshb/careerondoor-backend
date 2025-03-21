const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Password added
  avatar: { type: String, default: "" },
  reviewIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Review" }],
  admin: { type: Boolean, default: false },
}, { timestamps: true });


module.exports = mongoose.model("User", UserSchema);
