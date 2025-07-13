import express from "express";
import Movie from "../models/Movie.js";
import adminAuth from "../middleware/adminAuth.js";

const router = express.Router();

// ============================
// 🔐 Admin-Only: Add Movie
// ============================

app.post("/admin/add", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        const { screenshots } = req.body;

        // ✅ Ensure screenshots is always an array
        const validScreenshots = Array.isArray(screenshots) ?
            screenshots.filter((s) => s.trim() !== "") :
            screenshots ?
            [screenshots.trim()] :
            [];

        if (validScreenshots.length < 3) {
            return res.status(400).send("❌ Please enter at least 3 screenshots.");
        }

        const movieData = {
            ...req.body,
            cast: req.body.cast ? req.body.cast.split(",").map((s) => s.trim()) : [],
            genre: req.body.genre ? req.body.genre.split(",").map((s) => s.trim()) : [],
            quality: req.body.quality ? req.body.quality.split(",").map((s) => s.trim()) : [],
            screenshots: validScreenshots,
        };

        await Movie.create(movieData);
        res.redirect("/?admin=8892"); // ✅ Keep admin flag
    } catch (err) {
        console.error("❌ Error adding movie:", err.message);
        res.status(500).send("❌ Failed to add movie");
    }
});


// ============================
// 🎬 Movie Details + Suggestions
// ============================
router.get("/:id", async(req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);

        if (!movie) {
            return res.status(404).send("Movie not found");
        }

        const similarMovies = await Movie.find({
            _id: { $ne: movie._id },
            $or: [
                { genre: { $in: movie.genre } },
                { movieLanguage: movie.movieLanguage },
            ],
        }).limit(6);

        res.render("details", {
            movie,
            suggestions: similarMovies,
        });
    } catch (err) {
        console.error("Error loading movie details:", err);
        res.status(500).send("Internal Server Error");
    }
});

// ============================
// ⬇️ Download Page (15-sec delay logic done in view)
// ============================
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

// ============================
// ✏️ Admin-Only: Edit Movie
// ============================
router.get("/admin/edit/:id", adminAuth, async(req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).send("Movie not found");

        res.render("edit", { movie });
    } catch (err) {
        console.error("Error loading edit page:", err);
        res.status(500).send("Internal Server Error");
    }
});

router.post("/admin/edit/:id", adminAuth, async(req, res) => {
    try {
        const updatedData = {
            ...req.body,
            cast: req.body.cast ? req.body.cast.split(",").map(s => s.trim()) : [],
            genre: req.body.genre ? req.body.genre.split(",").map(s => s.trim()) : [],
            quality: req.body.quality ? req.body.quality.split(",").map(s => s.trim()) : [],
            screenshots: Array.isArray(req.body.screenshots) ?
                req.body.screenshots.filter(s => s.trim()) : req.body.screenshots ? [req.body.screenshots] : [],
        };


        await Movie.findByIdAndUpdate(req.params.id, updatedData);
        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("Error updating movie:", err);
        res.status(500).send("Internal Server Error");
    }
});

// ============================
// ❌ Admin-Only: Delete Movie
// ============================
router.get("/admin/delete/:id", adminAuth, async(req, res) => {
    try {
        await Movie.findByIdAndDelete(req.params.id);
        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("Error deleting movie:", err);
        res.status(500).send("Internal Server Error");
    }
});

// ✅ Export the router
export default router;