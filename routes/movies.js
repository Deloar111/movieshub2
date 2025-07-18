import express from "express";
import Movie from "../models/Movie.js";
import adminAuth from "../middleware/adminAuth.js";

const router = express.Router();

// ============================
// 🧠 ADVANCED RECOMMENDATION ALGORITHM
// ============================
class MovieRecommendationEngine {
    // Calculate similarity score between two movies
    static calculateSimilarity(movie1, movie2) {
        let score = 0;

        // Genre similarity (40% weight)
        const genreIntersection = movie1.genre.filter(g => movie2.genre.includes(g));
        const genreUnion = [...new Set([...movie1.genre, ...movie2.genre])];
        const genreScore = genreIntersection.length / genreUnion.length;
        score += genreScore * 0.4;

        // Language similarity (30% weight)
        const languageScore = movie1.movieLanguage === movie2.movieLanguage ? 1 : 0;
        score += languageScore * 0.3;

        // Cast similarity (20% weight)
        const castIntersection = movie1.cast.filter(c => movie2.cast.includes(c));
        const castUnion = [...new Set([...movie1.cast, ...movie2.cast])];
        const castScore = castUnion.length > 0 ? castIntersection.length / castUnion.length : 0;
        score += castScore * 0.2;

        // Quality similarity (10% weight)
        const qualityIntersection = movie1.quality.filter(q => movie2.quality.includes(q));
        const qualityUnion = [...new Set([...movie1.quality, ...movie2.quality])];
        const qualityScore = qualityUnion.length > 0 ? qualityIntersection.length / qualityUnion.length : 0;
        score += qualityScore * 0.1;

        return score;
    }

    // Get personalized recommendations
    static async getRecommendations(targetMovie, limit = 6) {
        try {
            // Get all movies except the target
            const allMovies = await Movie.find({ _id: { $ne: targetMovie._id } });

            // Calculate similarity scores
            const recommendations = allMovies.map(movie => ({
                movie,
                similarity: this.calculateSimilarity(targetMovie, movie)
            }));

            // Sort by similarity score (descending) and return top results
            return recommendations
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, limit)
                .map(rec => rec.movie);
        } catch (error) {
            console.error("Error in recommendation engine:", error);
            return [];
        }
    }
}

// ============================
// 🔍 INPUT VALIDATION ALGORITHMS
// ============================
class MovieValidator {
    static validateScreenshots(screenshots) {
        const validScreenshots = Array.isArray(screenshots) ?
            screenshots.filter(s => this.isValidUrl(s.trim())) :
            screenshots && this.isValidUrl(screenshots.trim()) ? [screenshots.trim()] : [];

        return {
            isValid: validScreenshots.length >= 3,
            screenshots: validScreenshots,
            error: validScreenshots.length < 3 ? "Please provide at least 3 valid screenshot URLs" : null
        };
    }

    static isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    static sanitizeArray(input) {
        if (!input) return [];
        return input.split(",")
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map(s => this.sanitizeString(s));
    }

    static sanitizeString(input) {
        return input.replace(/[<>]/g, "").trim();
    }

    static validateMovieData(body) {
        const errors = [];

        if (!body.title || body.title.trim().length < 2) {
            errors.push("Title must be at least 2 characters long");
        }

        if (!body.description || body.description.trim().length < 10) {
            errors.push("Description must be at least 10 characters long");
        }

        if (!body.poster || !this.isValidUrl(body.poster)) {
            errors.push("Valid poster URL is required");
        }

        const screenshotValidation = this.validateScreenshots(body.screenshots);
        if (!screenshotValidation.isValid) {
            errors.push(screenshotValidation.error);
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedData: {
                title: this.sanitizeString(body.title),
                description: this.sanitizeString(body.description),
                poster: body.poster,
                cast: this.sanitizeArray(body.cast),
                genre: this.sanitizeArray(body.genre),
                quality: this.sanitizeArray(body.quality),
                movieLanguage: this.sanitizeString(body.movieLanguage),
                screenshots: screenshotValidation.screenshots,
                qualityLinks: body.qualityLinks || {}
            }
        };
    }
}

// ============================
// 💾 CACHING LAYER
// ============================
class CacheManager {
    constructor() {
        this.cache = new Map();
        this.ttl = 5 * 60 * 1000; // 5 minutes TTL
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }

        return item.data;
    }

    set(key, data) {
        this.cache.set(key, {
            data,
            expiry: Date.now() + this.ttl
        });
    }

    clear() {
        this.cache.clear();
    }
}

const cache = new CacheManager();

// ============================
// 🔐 ENHANCED ADMIN: ADD MOVIE
// ============================
router.post("/admin/add", adminAuth, async(req, res) => {
    try {
        const validation = MovieValidator.validateMovieData(req.body);

        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                errors: validation.errors
            });
        }

        const newMovie = await Movie.create(validation.sanitizedData);

        // Clear cache after adding new movie
        cache.clear();

        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("❌ Error adding movie:", err.message);
        res.status(500).json({
            success: false,
            error: "Failed to add movie"
        });
    }
});

// ============================
// 🎬 ENHANCED MOVIE DETAILS + SMART RECOMMENDATIONS
// ============================
router.get("/:id", async(req, res) => {
    try {
        const movieId = req.params.id;
        const cacheKey = `movie_details_${movieId}`;

        // Check cache first
        let cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.render("details", cachedData);
        }

        // Fetch movie with error handling
        const movie = await Movie.findById(movieId);
        if (!movie) {
            return res.status(404).render("error", {
                message: "Movie not found",
                statusCode: 404
            });
        }

        // Get smart recommendations
        const suggestions = await MovieRecommendationEngine.getRecommendations(movie, 6);

        const renderData = { movie, suggestions };

        // Cache the result
        cache.set(cacheKey, renderData);

        res.render("details", renderData);
    } catch (err) {
        console.error("Error loading movie details:", err);
        res.status(500).render("error", {
            message: "Internal Server Error",
            statusCode: 500
        });
    }
});

// ============================
// ⬇️ ENHANCED DOWNLOAD PAGE
// ============================
router.get("/download/:id", async(req, res) => {
    try {
        const movieId = req.params.id;
        const cacheKey = `movie_download_${movieId}`;

        let movie = cache.get(cacheKey);
        if (!movie) {
            movie = await Movie.findById(movieId);
            if (!movie) {
                return res.status(404).render("error", {
                    message: "Movie not found",
                    statusCode: 404
                });
            }
            cache.set(cacheKey, movie);
        }

        res.render("download", { movie });
    } catch (err) {
        console.error("Error loading download page:", err);
        res.status(500).render("error", {
            message: "Internal Server Error",
            statusCode: 500
        });
    }
});

// ============================
// ✏️ ENHANCED ADMIN: EDIT MOVIE
// ============================
router.get("/admin/edit/:id", adminAuth, async(req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) {
            return res.status(404).render("error", {
                message: "Movie not found",
                statusCode: 404
            });
        }

        res.render("edit", { movie });
    } catch (err) {
        console.error("Error loading edit page:", err);
        res.status(500).render("error", {
            message: "Internal Server Error",
            statusCode: 500
        });
    }
});

router.post("/admin/edit/:id", adminAuth, async(req, res) => {
    try {
        const validation = MovieValidator.validateMovieData(req.body);

        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                errors: validation.errors
            });
        }

        await Movie.findByIdAndUpdate(req.params.id, validation.sanitizedData);

        // Clear cache after updating
        cache.clear();

        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("Error updating movie:", err);
        res.status(500).json({
            success: false,
            error: "Failed to update movie"
        });
    }
});

// ============================
// ❌ ENHANCED ADMIN: DELETE MOVIE
// ============================
router.get("/admin/delete/:id", adminAuth, async(req, res) => {
    try {
        const deletedMovie = await Movie.findByIdAndDelete(req.params.id);

        if (!deletedMovie) {
            return res.status(404).json({
                success: false,
                error: "Movie not found"
            });
        }

        // Clear cache after deletion
        cache.clear();

        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("Error deleting movie:", err);
        res.status(500).json({
            success: false,
            error: "Failed to delete movie"
        });
    }
});

// ============================
// 🔍 NEW: SEARCH & FILTER ENDPOINTS
// ============================
router.get("/api/search", async(req, res) => {
    try {
        const { q, genre, language, quality } = req.query;
        let query = {};

        if (q) {
            query.$or = [
                { title: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } },
                { cast: { $in: [new RegExp(q, 'i')] } }
            ];
        }

        if (genre) query.genre = { $in: [genre] };
        if (language) query.movieLanguage = language;
        if (quality) query.quality = { $in: [quality] };

        const movies = await Movie.find(query).limit(20);
        res.json({ success: true, movies });
    } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ success: false, error: "Search failed" });
    }
});

export default router;