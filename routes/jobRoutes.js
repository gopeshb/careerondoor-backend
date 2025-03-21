const express = require("express")
const router = express.Router()
const jobController = require("../controllers/job-controller")

// GET /api/jobs - Get all jobs with filtering, searching, and pagination
router.get("/", jobController.getJobs)

// GET /api/jobs/:id - Get a specific job by ID
router.get("/:id", jobController.getJobById)

// POST /api/jobs - Create a new job
router.post("/", jobController.createJob)

// PUT /api/jobs/:id - Update a job
router.put("/:id", jobController.updateJob)

// DELETE /api/jobs/:id - Delete a job
router.delete("/:id", jobController.deleteJob)

module.exports = router
