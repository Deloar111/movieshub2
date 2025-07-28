import express from "express";
import Movie from "../models/movies.js";
import adminAuth from "../middleware/adminAuth.js";
import { body, validationResult } from "express-validator";
import NodeCache from "node-cache";

const router = express.Router();
const cache = new NodeCache({ stdTTL: 3600 });

// ============================
// 🧠 ADVANCED RECOMMENDATION ENGINE
// ============================
class MovieRecommendationEngine {
    static calculateSimilarity(movie1, movie2) {
        let score = 0;

        const genre1 = movie1.genre || [];
        const genre2 = movie2.genre || [];
        const genreIntersection = genre1.filter(genre => genre2.includes(genre));
        score += (genreIntersection.length / (genre1.length || 1)) * 40;

        const yearDiff = Math.abs(movie1.year - movie2.year);
        score += Math.max(0, 30 - yearDiff);

        const titleWords1 = movie1.title.toLowerCase().split(" ");
        const titleWords2 = movie2.title.toLowerCase().split(" ");
        const commonWords = titleWords1.filter(word => titleWords2.includes(word));
        score += (commonWords.length / titleWords1.length) * 30;

        return score;
    }

    static getRecommendations(allMovies, targetMovie) {
        return allMovies
            .filter(m => m._id.toString() !== targetMovie._id.toString())
            .map(m => ({ movie: m, score: this.calculateSimilarity(targetMovie, m) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
            .map(entry => entry.movie);
    }
}

// ============================
// 📺 GET ALL MOVIES (CACHED)
// ============================
router.get("/", async(req, res) => {
    const cacheKey = req.originalUrl;
    if (cache.has(cacheKey)) {
        return res.render("home", { movies: cache.get(cacheKey), query: "" });
    }

    try {
        const movies = await Movie.find().sort({ createdAt: -1 }).limit(20);
        cache.set(cacheKey, movies);
        res.render("home", { movies, query: "" });
    } catch (err) {
        console.error("❌ Fetch movies error:", err);
        res.render("error", { message: "Something went wrong!" });
    }
});

// ============================
// 🔍 SEARCH
// ============================
router.get("/search", async(req, res) => {
    const query = req.query.q || "";
    const regex = new RegExp(query, "i");
    try {
        const movies = await Movie.find({
            $or: [
                { title: regex },
                { genre: regex },
                { description: regex }
            ]
        }).sort({ createdAt: -1 });

        res.render("home", { movies, query });
    } catch (err) {
        res.render("error", { message: "Search error." });
    }
});

// ============================
// ➕ ADD MOVIE (GET)
// ============================
router.get("/admin/add", adminAuth, (req, res) => {
    res.render("add", { errors: [], success: null });
});

// ============================
// ➕ ADD MOVIE (POST)
// ============================
router.post(
    "/admin/add",
    adminAuth, [
        body("title").notEmpty().withMessage("Title is required."),
        body("year").isInt().withMessage("Year must be a number."),
        body("poster").isURL().withMessage("Poster must be a valid URL."),
        body("downloadLinks.480p").optional().isURL().withMessage("480p link must be a valid URL.")
    ],
    async(req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render("add", { errors: errors.array(), success: null });
        }

        try {
            console.log("📝 Received form data:", req.body);

            const sanitizeString = value => (value && typeof value === 'string' ? value.trim() : "");
            const sanitizeNumber = (value, fallback = 0) => {
                const parsed = parseInt(value, 10);
                return isNaN(parsed) ? fallback : Math.max(0, parsed);
            };
            const sanitizeYear = value => {
                const year = parseInt(value, 10);
                const currentYear = new Date().getFullYear();
                if (isNaN(year) || year < 1900 || year > currentYear + 5) {
                    throw new Error("Invalid year provided");
                }
                return year;
            };

            const processArray = field => (!field ? [] : Array.isArray(field) ? field : [field]);

            const movieData = {
                title: sanitizeString(req.body.title),
                year: sanitizeYear(req.body.year),
                views: sanitizeNumber(req.body.views),
                downloads: sanitizeNumber(req.body.downloads),
                description: sanitizeString(req.body.description),
                cast: req.body.cast ?
                    req.body.cast
                    .split(",")
                    .map(c => c.replace(/^.*?:/, "").trim()) // remove 'Stars:', 'Actor:', etc.
                    .filter(Boolean) : [],

                genre: processArray(req.body.genre),
                movieLanguage: sanitizeString(req.body.movieLanguage),
                quality: processArray(req.body.quality),
                poster: sanitizeString(req.body.poster),
                screenshots: processArray(req.body.screenshots)
                    .map(s => typeof s === "string" ? s.trim() : "")
                    .filter(s => s.length > 0),

                qualityLinks: typeof req.body.qualityLinks === 'object' ? req.body.qualityLinks : {}
            };

            if (!movieData.title || !movieData.description || !movieData.poster || !movieData.movieLanguage || movieData.genre.length === 0 || movieData.screenshots.length < 3) {
                throw new Error("Missing required movie fields");
            }

            const movie = new Movie(movieData);
            const savedMovie = await movie.save();

            console.log("✅ Movie saved successfully:", savedMovie._id);
            cache.flushAll();

            res.render("add", { errors: [], success: "🎉 Movie added successfully!" });
        } catch (err) {
            console.error("❌ Movie save error:", err);
            res.render("add", { errors: [{ msg: `Error saving movie: ${err.message}` }], success: null });
        }
    }
);
router.get("/admin/edit/:id", adminAuth, async(req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).send("Movie not found");

        res.render("edit", { movie });
    } catch (err) {
        console.error("Edit load error:", err);
        res.status(500).send("Server error");
    }
});
router.post("/admin/edit/:id", adminAuth, async(req, res) => {
    try {
        const updatedData = {
            title: req.body.title,
            description: req.body.description,
            // include other fields
        };

        await Movie.findByIdAndUpdate(req.params.id, updatedData);
        res.redirect("/admin");
    } catch (err) {
        console.error("Edit save error:", err);
        res.status(500).send("Server error");
    }
});

// ============================
// 📃 MOVIE DETAILS + RECOMMENDATIONS
// ============================
router.get("/movies/:id", async(req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.render("error", { message: "Movie not found." });

        const allMovies = await Movie.find();
        const recommendations = MovieRecommendationEngine.getRecommendations(allMovies, movie);

        // ✅ Convert movie to plain object
        const movieData = movie.toObject();
        // ✅ Convert qualityLinks Map to normal object
        movieData.qualityLinks = Object.fromEntries(movie.qualityLinks);

        res.render("details", { movie: movieData, recommendations }); // ✅ safe to render
    } catch (err) {
        console.error("❌ Movie details error:", err);
        res.render("error", { message: "Movie not found." });
    }
});


// ============================
// 🎬 DOWNLOAD PAGE
// ============================
router.get("/movies/download/:id", async(req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.render("error", { message: "Movie not found." });
        res.render("download", { movie });
    } catch (err) {
        console.error("❌ Download page error:", err);
        res.render("error", { message: "Download page error." });
    }
});

// ============================
// 🌐 ABOUT + POLICY
// ============================
router.get("/about-us", (req, res) => res.render("about"));
router.get("/privacy-policy", (req, res) => res.render("privacy"));
router.get("/dmca", (req, res) => res.render("dmca"));
export default router;