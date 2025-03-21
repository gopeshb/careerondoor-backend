const express = require("express");
const reviewController = require("../controllers/reviewController");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", protect,reviewController.getReviews);
router.get("/:id", reviewController.getReviewById);

// 👇 Authentication required for adding, updating, and deleting reviews
router.post("/", protect, reviewController.addReviewToCompany);
router.put("/:reviewId", protect, reviewController.updateReviewInCompany);
router.delete("/:reviewId", protect, reviewController.deleteReviewInCompany);
module.exports = router;
