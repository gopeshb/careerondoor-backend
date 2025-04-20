const express = require("express")
const router = express.Router()
const jobController = require("../controllers/job-controller")
const { protect } = require("../middlewares/authMiddleware");
// GET /api/jobs - Get all jobs with filtering, searching, and pagination
// Static routes first
router.get("/", jobController.getJobs);
router.post("/", protect, jobController.createJob);
router.get("/locations", jobController.getLocations);
router.get("/verify", protect,jobController.getJobsForVerification);
router.patch("/:id/verify", protect, jobController.verifyJob);

// Dynamic routes last
router.get("/:id", jobController.getJobById);
router.put("/:id", protect, jobController.updateJob);
router.delete("/:id", protect, jobController.deleteJob);

module.exports = router;