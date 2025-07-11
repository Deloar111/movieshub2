import express from "express";
import Movie from "../models/Movie.js";

const router = express.Router();

// Route: GET /movies/:id — Movie Details + Suggestions
router.get("/:id", async(req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);

        if (!movie) {
            return res.status(404).send("Movie not found");
        }

        // Find similar movies based on genre or language
        const similarMovies = await Movie.find({
            _id: { $ne: movie._id },
            $or: [
                { genre: { $in: movie.genre } },
                { movieLanguage: movie.movieLanguage },
            ],
        }).limit(6);

        res.render("details", {
            movie,
            suggestions: similarMovies, // match your EJS variable
        });
    } catch (err) {
        console.error("Error loading movie details:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Route: GET /movies/download/:id — Countdown Page
router.get("/download/:id", async(req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);

        if (!movie) {
            return res.status(404).send("Movie not found");
        }

        res.render("download", { movie });
    } catch (err) {
        console.error("Error loading download page:", err);
        res.status(500).send("Internal Server Error");
    }
});

// =========================
// 🔐 Admin-Only Routes
// =========================

import adminAuth from "../middleware/adminAuth.js"; // already used

// Add/Edit/Delete routes below are admin-only
router.get("/admin/edit/:id", adminAuth, async(req, res) => {
    const movie = await Movie.findById(req.params.id);
    res.render("edit", { movie });
});

router.post("/admin/edit/:id", adminAuth, async(req, res) => {
    await Movie.findByIdAndUpdate(req.params.id, req.body);
    res.redirect("/");
});

router.get("/admin/delete/:id", adminAuth, async(req, res) => {
    await Movie.findByIdAndDelete(req.params.id);
    res.redirect("/");
});


// ✅ EXPORT after all routes
export default router;