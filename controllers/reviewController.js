const Review = require("../models/Review");
const mongoose = require("mongoose");
const Company = require("../models/Company");

// Get all reviews
exports.getReviews = async (req, res) => {
  try {
    const { userId } = req.query; // Frontend se userId aayegi query params me

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const reviews = await Review.find({ userId }) // User ke saare reviews fetch karna
      .populate({
        path: "companyId",
        select: "name website", // Company ke sirf name aur website select karna
      });

    // Response send karna
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};


// Get a review by ID
exports.getReviewById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid review ID" });
    }

    const review = await Review.findById(id)
      .populate("companyId", "name website"); // Populate company name and website

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.json(review);
  } catch (error) {
    console.error("Error fetching review:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


exports.updateReviewInCompany = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { workEnv, jobSec, salary, rating } = req.body;

    // Old review fetch karna
    const oldReview = await Review.findById(reviewId);
    if (!oldReview) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Company fetch karna
    const company = await Company.findById(oldReview.companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Old values
    const totalReviews = company.TotalReviews;

    // Remove old review's contribution
    const updatedWorkEnv = ((company.workEnv * totalReviews) - oldReview.workEnv + workEnv) / totalReviews;
    const updatedJobSec = ((company.jobSec * totalReviews) - oldReview.jobSec + jobSec) / totalReviews;
    const updatedSalary = ((company.salary * totalReviews) - oldReview.salary + salary) / totalReviews;
    const updatedAvgRating = ((company.avgRating * totalReviews) - oldReview.rating + rating) / totalReviews;

    // Review update karna
    await Review.findByIdAndUpdate(reviewId, { workEnv, jobSec, salary, rating });

    // Company model update karna
    await Company.findByIdAndUpdate(oldReview.companyId, {
      $set: {
        workEnv: parseFloat(updatedWorkEnv.toFixed(2)),
        jobSec: parseFloat(updatedJobSec.toFixed(2)),
        salary: parseFloat(updatedSalary.toFixed(2)),
        avgRating: parseFloat(updatedAvgRating.toFixed(2)),
      }
    });

    return res.status(200).json({ message: "Review updated and company stats updated successfully" });

  } catch (error) {
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};



exports.addReviewToCompany = async (req, res) => {
  try {
    let { companyId, companyName, companyWebsite, workEnv, jobSec, salary, rating } = req.body;
    let userId = req.user.id;
    
    // Validate required review fields
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Ensure numeric values are valid
    if ([workEnv, jobSec, salary, rating].some(val => typeof val !== "number" || isNaN(val) || val < 1)) {
      return res.status(400).json({ message: "Values for workEnv, jobSec, salary, and rating must be valid numbers (at least 1)." });
    }

    // Validate that userId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId. Must be a valid ObjectId." });
    }

    let company;

    // If companyId is not provided, try to find or create the company using name and website
    if (!companyId) {
      if (!companyName || !companyWebsite) {
        return res.status(400).json({ message: "Either provide companyId or companyName and companyWebsite" });
      }

      // Extract company name from URL for comparison
      let urlCompanyName = '';
      try {
        const url = new URL(companyWebsite);
        const hostname = url.hostname;
        // Remove www. prefix if present and domain suffix
        urlCompanyName = hostname.replace(/^www\./, '').split('.')[0];
      } catch (error) {
        // If URL parsing fails, use the website as is
        urlCompanyName = companyWebsite;
      }

      // Check if company exists by exact name match
      company = await Company.findOne({ 
        name: { $regex: new RegExp(`^${companyName}$`, 'i') } } 
      );
      
      
      if (company) {
        return res.status(400).json({ message: `Company already exists: ${company.name}` });
      }

      // Check if company exists by URL-extracted name
      if (urlCompanyName) {
        company = await Company.findOne({ 
          $or: [
            { name: { $regex: new RegExp(`^${companyName}$`, 'i') } },
            { name: { $regex: new RegExp(`^${urlCompanyName}$`, 'i') } }
          ]
        });
        
        if (company) {
          return res.status(400).json({ message: `Company already exists: ${company.name}` });
        }
      }

      // Create new company if it doesn't exist
      company = await Company.create({ name: companyName, website: companyWebsite });
      companyId = company._id;
    } else {
      // If companyId is provided, find the company
      company = await Company.findById(companyId);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
    }
    
    // Check if user has already reviewed the company
    const existingReview = await Review.findOne({ companyId, userId });
    if (existingReview) {
      return res.status(400).json({ message: "You have already reviewed this company." });
    }

    // Create a new review
    const newReview = await Review.create({ companyId, userId, workEnv, jobSec, salary, rating });

    const totalReviews = company.TotalReviews || 0;
    const newTotalReviews = totalReviews + 1;

    // Update company stats
    if (totalReviews === 0) {
      company.workEnv = workEnv;
      company.jobSec = jobSec;
      company.salary = salary;
      company.avgRating = rating;
    } else {
      company.workEnv = ((company.workEnv * totalReviews) + workEnv) / newTotalReviews;
      company.jobSec = ((company.jobSec * totalReviews) + jobSec) / newTotalReviews;
      company.salary = ((company.salary * totalReviews) + salary) / newTotalReviews;
      company.avgRating = ((company.avgRating * totalReviews) + rating) / newTotalReviews;
    }

    // Round values to two decimal places
    company.workEnv = parseFloat(company.workEnv.toFixed(2));
    company.jobSec = parseFloat(company.jobSec.toFixed(2));
    company.salary = parseFloat(company.salary.toFixed(2));
    company.avgRating = parseFloat(company.avgRating.toFixed(2));
    company.TotalReviews = newTotalReviews;

    // Add the new review to the company's review list and save
    company.reviews.push(newReview._id);
    await company.save();

    return res.status(201).json({ message: "Review added and company updated successfully", review: newReview });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};



exports.deleteReviewInCompany = async (req, res) => {
  try {
    const { reviewId } = req.params;

    // Review fetch karna
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Company fetch karna
    const company = await Company.findById(review.companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Old values
    const totalReviews = company.TotalReviews;
    if (totalReviews <= 1) {
      // Agar sirf ek review hai, toh sabko reset kar do
      await Company.findByIdAndUpdate(review.companyId, {
        $set: {
          workEnv: 0,
          jobSec: 0,
          salary: 0,
          avgRating: 0,
          TotalReviews: 0
        },
        $pull: { reviews: reviewId }
      });
    } else {
      // New aggregated values after removing review
      const newTotalReviews = totalReviews - 1;
      const updatedWorkEnv = ((company.workEnv * totalReviews) - review.workEnv) / newTotalReviews;
      const updatedJobSec = ((company.jobSec * totalReviews) - review.jobSec) / newTotalReviews;
      const updatedSalary = ((company.salary * totalReviews) - review.salary) / newTotalReviews;
      const updatedAvgRating = ((company.avgRating * totalReviews) - review.rating) / newTotalReviews;

      // Company model update karna
      await Company.findByIdAndUpdate(review.companyId, {
        $set: {
          workEnv: parseFloat(updatedWorkEnv.toFixed(2)),
          jobSec: parseFloat(updatedJobSec.toFixed(2)),
          salary: parseFloat(updatedSalary.toFixed(2)),
          avgRating: parseFloat(updatedAvgRating.toFixed(2)),
          TotalReviews: newTotalReviews
        },
        $pull: { reviews: reviewId }
      });
    }

    // Review delete karna
    await Review.findByIdAndDelete(reviewId);

    return res.status(200).json({ message: "Review deleted and company updated successfully" });

  } catch (error) {
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};


