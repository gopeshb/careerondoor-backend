const Job = require("../models/Job")
const mongoose = require("mongoose")

// Get all jobs with filtering, searching, and pagination
exports.getJobs = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const skip = (page - 1) * limit

    // Build query based on filters
    const query = {}

    // Keyword search (skills, role, company name)
    if (req.query.keyword) {
      const keyword = req.query.keyword
      query.$or = [
        { role: { $regex: keyword, $options: "i" } },
        { skills_required: { $regex: keyword, $options: "i" } },
      ]

      // Also search by company name (requires aggregation)
      // We'll handle this in the aggregation pipeline
    }

    // Experience filter
    if (req.query.experience) {
      if (req.query.experience === "fresher") {
        query.experience = 0
      } else if (req.query.experience === "0-2") {
        query.experience = { $gt: 0, $lte: 2 }
      } else if (req.query.experience === "2+") {
        query.experience = { $gt: 2 }
      }
    }

    // Aggregation pipeline to include company name search
    const aggregationPipeline = [
      // Lookup to get company details
      {
        $lookup: {
          from: "companies",
          localField: "companyId",
          foreignField: "_id",
          as: "companyDetails",
        },
      },
      { $unwind: "$companyDetails" },

      // Match based on query conditions
      { $match: query },
    ]

    // Add company name search if keyword is provided
    if (req.query.keyword) {
      aggregationPipeline[2].$match.$or = aggregationPipeline[2].$match.$or || []
      aggregationPipeline[2].$match.$or.push({
        "companyDetails.name": { $regex: req.query.keyword, $options: "i" },
      })
    }

    // Add sorting, counting, pagination
    const countPipeline = [...aggregationPipeline, { $count: "total" }]

    aggregationPipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      // Reshape the output to match our expected format
      {
        $project: {
          _id: 1,
          role: 1,
          experience: 1,
          location: 1,
          skills_required: 1,
          expected_salary: 1,
          applylink: 1,
          description: 1,
          companyId: {
            _id: "$companyDetails._id",
            name: "$companyDetails.name",
            workEnv: "$companyDetails.workEnv",
            jobSec: "$companyDetails.jobSec",
            salary: "$companyDetails.salary",
            avgRating: "$companyDetails.avgRating",
            TotalReviews: "$companyDetails.TotalReviews",
          },
        }
        
      },
    )

    // Execute both queries in parallel
    const [jobs, countResult] = await Promise.all([Job.aggregate(aggregationPipeline), Job.aggregate(countPipeline)])

    const totalJobs = countResult.length > 0 ? countResult[0].total : 0

    res.json({
      jobs,
      totalJobs,
      currentPage: page,
      totalPages: Math.ceil(totalJobs / limit),
    })
  } catch (err) {
    console.error("Error fetching jobs:", err)
    res.status(500).json({ message: "Server error" })
  }
}

// Get a specific job by ID
exports.getJobById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).populate("companyId", "name website")

    if (!job) {
      return res.status(404).json({ message: "Job not found" })
    }

    res.json(job)
  } catch (err) {
    console.error("Error fetching job:", err)
    res.status(500).json({ message: "Server error" })
  }
}

// Create a new job

exports.createJob = async (req, res) => {
  try {
    const { 
      role, 
      experience, 
      location, 
      skills_required, 
      companyId, 
      expected_salary, 
      applylink, 
      last_date, 
      description 
    } = req.body;

    // Validate required fields
    if (!role || !experience || !location || !Array.isArray(skills_required) || 
        !companyId || !expected_salary || !applylink || !last_date || !description) {
      return res.status(400).json({ message: "All fields are required and skills_required must be an array" });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: "Invalid company ID" });
    }

    // Validate last_date
    const parsedDate = new Date(last_date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid last_date format. Use YYYY-MM-DD" });
    }

    // Ensure all skills are trimmed strings
    const cleanedSkills = skills_required.map(skill => skill.trim());

    // Create and save job
    const newJob = new Job({
      role, 
      experience, 
      location, 
      skills_required: cleanedSkills, 
      companyId,
      expected_salary, 
      applylink, 
      last_date: parsedDate, 
      description
    });

    const savedJob = await newJob.save();
    res.status(201).json(savedJob);
  } catch (error) {
    console.error("Error creating job:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update a job
exports.updateJob = async (req, res) => {
  try {
    const { role, experience, location, skills_required, companyId, expected_salary, applylink, last_date } = req.body

    // Process skills if provided
    if (skills_required && !Array.isArray(skills_required)) {
      req.body.skills_required = skills_required.split(",").map((skill) => skill.trim())
    }

    // Validate companyId if provided
    if (companyId && !mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: "Invalid company ID" })
    }

    const updatedJob = await Job.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true },
    )

    if (!updatedJob) {
      return res.status(404).json({ message: "Job not found" })
    }

    res.json(updatedJob)
  } catch (err) {
    console.error("Error updating job:", err)
    res.status(500).json({ message: "Server error" })
  }
}

// Delete a job
exports.deleteJob = async (req, res) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id)

    if (!job) {
      return res.status(404).json({ message: "Job not found" })
    }

    res.json({ message: "Job deleted successfully" })
  } catch (err) {
    console.error("Error deleting job:", err)
    res.status(500).json({ message: "Server error" })
  }
}

