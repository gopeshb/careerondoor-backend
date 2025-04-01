const express = require("express")
const router = express.Router()
const jobController = require("../controllers/job-controller")
const { protect } = require("../middlewares/authMiddleware");
// GET /api/jobs - Get all jobs with filtering, searching, and pagination
router.get("/", jobController.getJobs)



// POST /api/jobs - Create a new job
router.post("/",protect, jobController.createJob)

router.get("/locations", jobController.getLocations)
router.get("/:id", jobController.getJobById)

// Protected routes
router.post("/",protect, jobController.createJob)
router.put("/:id",protect, jobController.updateJob)
router.delete("/:id",protect, jobController.deleteJob)


router.patch("/:id/verify", jobController.verifyJob)

module.exports = router
