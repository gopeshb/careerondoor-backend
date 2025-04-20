const express = require("express")
const router = express.Router()
const internshipController = require("../controllers/internship-controller")
const { protect } = require("../middlewares/authMiddleware");


router.get("/", internshipController.getInternships)
router.post("/", protect, internshipController.createInternship)
router.get("/locations", internshipController.getLocations);
router.get("/verify", protect,internshipController.getInternshipsForVerification);

router.patch("/:id/verify", protect, internshipController.verifyInternship);

router.get("/:id", internshipController.getInternshipById)
router.delete("/:id", protect, internshipController.deleteInternship)


module.exports = router

