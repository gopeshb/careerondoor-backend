const Internship = require("../models/Internship")
const mongoose = require("mongoose")

// Get all internships with filtering, searching, and pagination
exports.getInternships = async (req, res) => {
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

    // Duration filter
    if (req.query.duration) {
      const duration = Number.parseInt(req.query.duration)
      if (!isNaN(duration)) {
        query.duration = duration
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
          location: 1,
          skills_required: 1,
          stipend: 1,
          duration: 1, // Include duration in the projection
          applylink: 1,
          description: 1,
          last_date: 1,
          companyId: {
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
    )

    // Execute both queries in parallel
    const [internships, countResult] = await Promise.all([
      Internship.aggregate(aggregationPipeline),
      Internship.aggregate(countPipeline),
    ])

    const totalInternships = countResult.length > 0 ? countResult[0].total : 0

    res.json({
      internships,
      totalInternships,
      currentPage: page,
      totalPages: Math.ceil(totalInternships / limit),
    })
  } catch (err) {
    console.error("Error fetching internships:", err)
    res.status(500).json({ message: "Server error" })
  }
}

// Create a new internship
exports.createInternship = async (req, res) => {
  try {
    const { role, location, skills_required, companyId, stipend, duration, applylink, last_date, description } =
      req.body

    // Validate required fields
    if (
      !role ||
      !location ||
      !Array.isArray(skills_required) ||
      !companyId ||
      !stipend ||
      !duration ||
      !applylink ||
      !last_date ||
      !description
    ) {
      return res.status(400).json({ message: "All fields are required and skills_required must be an array" })
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: "Invalid company ID" })
    }

    // Validate duration
    const durationValue = Number.parseInt(duration)
    if (isNaN(durationValue) || durationValue < 1) {
      return res.status(400).json({ message: "Duration must be a positive number" })
    }

    // Validate last_date
    const parsedDate = new Date(last_date)
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid last_date format. Use YYYY-MM-DD" })
    }

    // Ensure all skills are trimmed strings
    const cleanedSkills = skills_required.map((skill) => skill.trim())

    // Create and save internship
    const newInternship = new Internship({
      role,
      location,
      skills_required: cleanedSkills,
      companyId,
      stipend,
      duration: durationValue,
      applylink,
      last_date: parsedDate,
      description,
    })

    const savedInternship = await newInternship.save()
    res.status(201).json(savedInternship)
  } catch (error) {
    console.error("Error creating internship:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Update an internship
exports.updateInternship = async (req, res) => {
  try {
    const { role, location, skills_required, companyId, stipend, duration, applylink, last_date, description } =
      req.body

    // Process skills if provided
    if (skills_required && !Array.isArray(skills_required)) {
      req.body.skills_required = skills_required.split(",").map((skill) => skill.trim())
    }

    // Validate companyId if provided
    if (companyId && !mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: "Invalid company ID" })
    }

    // Validate duration if provided
    if (duration !== undefined) {
      const durationValue = Number.parseInt(duration)
      if (isNaN(durationValue) || durationValue < 1) {
        return res.status(400).json({ message: "Duration must be a positive number" })
      }
      req.body.duration = durationValue
    }

    const updatedInternship = await Internship.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true },
    )

    if (!updatedInternship) {
      return res.status(404).json({ message: "Internship not found" })
    }

    res.json(updatedInternship)
  } catch (err) {
    console.error("Error updating internship:", err)
    res.status(500).json({ message: "Server error" })
  }
}

// Get internship by ID
exports.getInternshipById = async (req, res) => {
  try {
    const internship = await Internship.findById(req.params.id).populate("companyId")

    if (!internship) {
      return res.status(404).json({ message: "Internship not found" })
    }

    res.json(internship)
  } catch (err) {
    console.error("Error fetching internship:", err)
    res.status(500).json({ message: "Server error" })
  }
}

// Delete internship
exports.deleteInternship = async (req, res) => {
  try {
    const internship = await Internship.findByIdAndDelete(req.params.id)

    if (!internship) {
      return res.status(404).json({ message: "Internship not found" })
    }

    res.json({ message: "Internship deleted successfully" })
  } catch (err) {
    console.error("Error deleting internship:", err)
    res.status(500).json({ message: "Server error" })
  }
}

