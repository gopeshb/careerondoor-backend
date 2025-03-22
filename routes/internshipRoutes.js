const express = require("express")
const router = express.Router()
const internshipController = require("../controllers/internship-controller")
const { protect } = require("../middlewares/authMiddleware");

// GET /api/internships - Get all internships with filtering, searching, and pagination
router.get("/", internshipController.getInternships)

// GET /api/internships/:id - Get internship by ID
router.get("/:id", internshipController.getInternshipById)

// POST /api/internships - Create a new internship (admin only)
router.post("/", protect, internshipController.createInternship)

// PUT /api/internships/:id - Update an internship (admin only)
router.put("/:id", protect, internshipController.updateInternship)

// DELETE /api/internships/:id - Delete an internship (admin only)
router.delete("/:id", protect, internshipController.deleteInternship)

module.exports = router

