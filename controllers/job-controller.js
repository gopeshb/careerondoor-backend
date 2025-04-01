const Job = require("../models/Job")
const mongoose = require("mongoose")
const { ObjectId } = mongoose.Types

// Get all jobs with filtering, searching, and pagination
exports.getJobs = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1;
    const limit = Number.parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Base query - only verified jobs
    const query = { verified: true };

    // Keyword search (role, skills, description)
    if (req.query.keyword) {
      const keyword = req.query.keyword;
      query.$or = [
        { role: { $regex: keyword, $options: "i" } },
        { skills_required: { $in: [new RegExp(keyword, 'i')] } },
        { description: { $regex: keyword, $options: "i" } }
      ];
    }

    // Experience filter - using min_experience and max_experience from schema
    if (req.query.experience) {
      if (req.query.experience === "fresher") {
        // Fresher (0 years)
        query.min_experience = 0;
      } else if (req.query.experience === "0-2") {
        // 0-2 years
        query.min_experience = { $gte: 0 };
        query.max_experience = { $lte: 2 };
      } else if (req.query.experience === "2-5") {
        // 2-5 years
        query.min_experience = { $gte: 2 };
        query.max_experience = { $lte: 5 };
      } else if (req.query.experience === "5+") {
        // 5+ years
        query.min_experience = { $gte: 5 };
      }
    }

    // Location filter
    if (req.query.country) {
      query.country = req.query.country;
    }
    
    if (req.query.city) {
      query.cities = req.query.city;
    }
    
    // Remote filter
    if (req.query.remote === 'true') {
      query.remote = true;
    }

    // Aggregation pipeline
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
    ];

    // Add company name search if keyword is provided
    if (req.query.keyword) {
      aggregationPipeline[2].$match.$or = aggregationPipeline[2].$match.$or || [];
      aggregationPipeline[2].$match.$or.push({
        "companyDetails.name": { $regex: req.query.keyword, $options: "i" },
      });
    }

    // Add sorting, counting, pagination
    const countPipeline = [...aggregationPipeline, { $count: "total" }];

    aggregationPipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      // Project fields that match our schema
      {
        $project: {
          _id: 1,
          role: 1,
          min_experience: 1,
          max_experience: 1,
          country: 1,
          cities: 1,
          remote: 1,
          skills_required: 1,
          min_salary: 1,
          max_salary: 1,
          currency: 1,
          applylink: 1,
          last_date: 1,
          description: 1,
          verified: 1,
          createdAt: 1,
          updatedAt: 1,
          company: {
            _id: "$companyDetails._id",
            name: "$companyDetails.name",
            // Include other company fields you need
            workEnv: "$companyDetails.workEnv",
            jobSec: "$companyDetails.jobSec",
            salary: "$companyDetails.salary",
            avgRating: "$companyDetails.avgRating",
            TotalReviews: "$companyDetails.TotalReviews",
          },
        }
      },
    );

    // Execute both queries in parallel for better performance
    const [jobs, countResult] = await Promise.all([
      Job.aggregate(aggregationPipeline).exec(),
      Job.aggregate(countPipeline).exec()
    ]);

    const totalJobs = countResult.length > 0 ? countResult[0].total : 0;

    res.json({
      jobs,
      totalJobs,
      currentPage: page,
      totalPages: Math.ceil(totalJobs / limit),
    });
  } catch (err) {
    console.error("Error fetching jobs:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Controller to get all available locations for dropdown
exports.getLocations = async (req, res) => {
  try {
    // Get distinct countries
    const countries = await Job.distinct("country", { verified: true });
    
    // Get distinct cities across all jobs
    const cities = await Job.distinct("cities", { verified: true });
    
    // Filter out any null or empty values
    const filteredCities = cities.flat().filter(city => city && city.trim() !== '');
    
    res.json({
      countries: countries.sort(),
      cities: [...new Set(filteredCities)].sort() // Remove duplicates and sort
    });
  } catch (err) {
    console.error("Error fetching locations:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// Create a new job

exports.getJobById = async (req, res) => {
  try {
    const jobId = req.params.id

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "Invalid job ID format" })
    }

    // Use aggregation to get job with company details
    const job = await Job.aggregate([
      { $match: { _id: new ObjectId(jobId) } },
      {
        $lookup: {
          from: "companies",
          localField: "companyId",
          foreignField: "_id",
          as: "companyDetails",
        },
      },
      { $unwind: "$companyDetails" },
      {
        $project: {
          _id: 1,
          role: 1,
          min_experience: 1,
          max_experience: 1,
          country: 1,
          cities: 1,
          remote: 1,
          skills_required: 1,
          min_salary: 1,
          max_salary: 1,
          currency: 1,
          applylink: 1,
          last_date: 1,
          description: 1,
          verified: 1,
          createdAt: 1,
          updatedAt: 1,
          company: {
            _id: "$companyDetails._id",
            name: "$companyDetails.name",
            workEnv: "$companyDetails.workEnv",
            jobSec: "$companyDetails.jobSec",
            salary: "$companyDetails.salary",
            avgRating: "$companyDetails.avgRating",
            TotalReviews: "$companyDetails.TotalReviews",
          },
        },
      },
    ])

    if (!job || job.length === 0) {
      return res.status(404).json({ message: "Job not found" })
    }

    // Increment view count or track analytics here if needed

    res.json(job[0])
  } catch (err) {
    console.error("Error fetching job details:", err)
    res.status(500).json({ message: "Server error" })
  }
}

// Get all available locations for dropdown
exports.getLocations = async (req, res) => {
  try {
    // Get distinct countries
    const countries = await Job.distinct("country", { verified: true })

    // Get distinct cities across all jobs
    const cities = await Job.distinct("cities", { verified: true })

    // Filter out any null or empty values
    const filteredCities = cities.flat().filter((city) => city && city.trim() !== "")

    res.json({
      countries: countries.sort(),
      cities: [...new Set(filteredCities)].sort(), // Remove duplicates and sort
    })
  } catch (err) {
    console.error("Error fetching locations:", err)
    res.status(500).json({ message: "Server error" })
  }
}

// Create a new job
exports.createJob = async (req, res) => {
  try {
    const {
      role,
      min_experience,
      max_experience,
      country,
      cities,
      remote,
      skills_required,
      companyId,
      min_salary,
      max_salary,
      currency,
      applylink,
      last_date,
      description,
    } = req.body

    // Validate required fields
    if (!role || !companyId || !applylink || !last_date || !description) {
      return res.status(400).json({ message: "Required fields missing" })
    }

    // Validate company ID
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: "Invalid company ID" })
    }

    // Create new job
    const newJob = new Job({
      role,
      min_experience: min_experience || 0,
      max_experience,
      country,
      cities: Array.isArray(cities) ? cities : cities ? [cities] : [],
      remote: Boolean(remote),
      skills_required: Array.isArray(skills_required) ? skills_required : [],
      companyId,
      min_salary,
      max_salary,
      currency: currency || "INR",
      applylink,
      last_date,
      description,
      verified: false, // Default to unverified, admin will verify later
    })

    const savedJob = await newJob.save()

    res.status(201).json({
      message: "Job created successfully",
      job: savedJob,
    })
  } catch (err) {
    console.error("Error creating job:", err)

    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: "Validation error",
        errors: Object.values(err.errors).map((e) => e.message),
      })
    }

    res.status(500).json({ message: "Server error" })
  }
}

// Update job by ID (for admin or job owner)
exports.updateJob = async (req, res) => {
  try {
    const jobId = req.params.id

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "Invalid job ID format" })
    }

    const job = await Job.findById(jobId)

    if (!job) {
      return res.status(404).json({ message: "Job not found" })
    }

    // Check if user has permission to update this job
    // This depends on your auth system - implement as needed

    // Update job fields
    const updateData = { ...req.body }

    // Handle arrays properly
    if (updateData.cities && !Array.isArray(updateData.cities)) {
      updateData.cities = updateData.cities ? [updateData.cities] : []
    }

    if (updateData.skills_required && !Array.isArray(updateData.skills_required)) {
      updateData.skills_required = updateData.skills_required ? [updateData.skills_required] : []
    }

    // Update the job
    const updatedJob = await Job.findByIdAndUpdate(jobId, { $set: updateData }, { new: true, runValidators: true })

    res.json({
      message: "Job updated successfully",
      job: updatedJob,
    })
  } catch (err) {
    console.error("Error updating job:", err)

    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: "Validation error",
        errors: Object.values(err.errors).map((e) => e.message),
      })
    }

    res.status(500).json({ message: "Server error" })
  }
}

// Delete job by ID (for admin or job owner)
exports.deleteJob = async (req, res) => {
  try {
    const jobId = req.params.id

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "Invalid job ID format" })
    }

    const job = await Job.findById(jobId)

    if (!job) {
      return res.status(404).json({ message: "Job not found" })
    }

    // Check if user has permission to delete this job
    // This depends on your auth system - implement as needed

    await Job.findByIdAndDelete(jobId)

    res.json({ message: "Job deleted successfully" })
  } catch (err) {
    console.error("Error deleting job:", err)
    res.status(500).json({ message: "Server error" })
  }
}

// Verify job (admin only)
exports.verifyJob = async (req, res) => {
  try {
    const jobId = req.params.id

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "Invalid job ID format" })
    }

    const job = await Job.findById(jobId)

    if (!job) {
      return res.status(404).json({ message: "Job not found" })
    }

    // Check if user is admin
    // This depends on your auth system - implement as needed

    job.verified = true
    await job.save()

    res.json({
      message: "Job verified successfully",
      job,
    })
  } catch (err) {
    console.error("Error verifying job:", err)
    res.status(500).json({ message: "Server error" })
  }
}


