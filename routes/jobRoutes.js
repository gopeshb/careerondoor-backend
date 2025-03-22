const express = require("express")
const router = express.Router()
const jobController = require("../controllers/job-controller")
const { protect } = require("../middlewares/authMiddleware");
// GET /api/jobs - Get all jobs with filtering, searching, and pagination
router.get("/", jobController.getJobs)



// POST /api/jobs - Create a new job
router.post("/",protect, jobController.createJob)

// PUT /api/jobs/:id - Update a job
router.put("/:id",protect, jobController.updateJob)



module.exports = router
