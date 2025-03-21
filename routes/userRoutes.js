const express = require("express");
const { getUsers, createUser,updateProfile } = require("../controllers/userController");
const { protect } = require("../middlewares/authMiddleware");
const router = express.Router();

router.get("/",protect, getUsers);
router.post("/", protect,createUser);
router.put("/",protect,updateProfile)

module.exports = router;
