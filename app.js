// app.js - FIXED VERSION WITH DEBUG LOGGING
import express from "express";
import mongoose from "mongoose";
import path from "path";
import bodyParser from "body-parser";
import lodash from "lodash";
import Movie from "./models/movies.js";
import adminAuth from "./middleware/adminAuth.js";

const { escapeRegExp } = lodash;
const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

// ============================
// 🔧 MIDDLEWARE SETUP
// ============================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));

// ⚠️ IMPORTANT: Use adminAuth middleware but handle errors properly
app.use((req, res, next) => {
    try {
        adminAuth(req, res, next);
    } catch (err) {
        console.log('⚠️ AdminAuth middleware error:', err.message);
        res.locals.isAdmin = false;
        next();
    }
});

// Handle favicon request
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// ============================
// 🔗 MONGODB CONNECTION (WITH BETTER ERROR HANDLING)
// ============================
const connectDB = async() => {
    try {
        const mongoUrl = process.env.MONGO_URL ||
            "mongodb+srv://deloarhossen:8PwxJE5xWkALIPK@watchview.x1xjpmm.mongodb.net/watchview?retryWrites=true&w=majority&appName=watchview";

        await mongoose.connect(mongoUrl, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ MongoDB Connected Successfully");

        // Test the connection with a simple query
        const movieCount = await Movie.countDocuments();
        console.log(`📊 Current movies in database: ${movieCount}`);

    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
        process.exit(1);
    }
};

connectDB();

// ============================
// 🏠 HOMEPAGE WITH ENHANCED DEBUG
// ============================
app.get("/", async(req, res) => {
    try {
        console.log("📥 Homepage request received");
        console.log("Query params:", req.query);

        const page = parseInt(req.query.page) || 1;
        const limit = 14;
        const searchQuery = (req.query.search || "").trim();
        const category = req.query.category;

        console.log(`🔍 Search params - Page: ${page}, Search: "${searchQuery}", Category: "${category}"`);

        let movies = [];
        let totalMovies = 0;

        if (searchQuery) {
            console.log("🔍 Performing search query...");
            const escapedSearch = escapeRegExp(searchQuery);

            const searchFilter = {
                $or: [
                    { title: { $regex: escapedSearch, $options: "i" } },
                    { description: { $regex: escapedSearch, $options: "i" } },
                    { cast: { $in: [new RegExp(escapedSearch, "i")] } },
                    { genre: { $in: [new RegExp(escapedSearch, "i")] } }
                ]
            };

            if (category && category !== "All Movies") {
                searchFilter.genre = { $regex: category, $options: "i" };
            }

            movies = await Movie.find(searchFilter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit);

            totalMovies = await Movie.countDocuments(searchFilter);
            console.log(`🔍 Search results: ${movies.length} movies found`);

        } else {
            console.log("📋 Loading all movies...");
            const query = {};

            if (category && category !== "All Movies") {
                query.genre = { $regex: category, $options: "i" };
                console.log(`📂 Filtering by category: ${category}`);
            }

            // If admin=8892, show all movies without pagination
            if (req.query.admin === "8892") {
                console.log("👨‍💼 Admin mode: Loading all movies");
                movies = await Movie.find(query).sort({ createdAt: -1 });
                totalMovies = movies.length;
            } else {
                totalMovies = await Movie.countDocuments(query);
                movies = await Movie.find(query)
                    .sort({ createdAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit);
            }

            console.log(`📊 Found ${totalMovies} total movies, showing ${movies.length}`);
        }

        const totalPages = Math.ceil(totalMovies / limit);

        // Get trending movies only for main page (no search/category)
        const trendingMovies = !searchQuery && !category ?
            await Movie.find().sort({ createdAt: -1 }).limit(4) : [];

        console.log(`🎬 Trending movies: ${trendingMovies.length}`);
        console.log(`👨‍💼 Admin status: ${res.locals.isAdmin}`);

        res.render("home", {
            movies,
            trendingMovies,
            currentPage: page,
            totalPages,
            searchQuery,
            category,
            isAdmin: res.locals.isAdmin || false,
        });

    } catch (err) {
        console.error("❌ Homepage Error:", err);
        console.error("Stack trace:", err.stack);
        res.status(500).render("error", {
            message: "Error loading homepage: " + err.message,
            statusCode: 500
        });
    }
});

// ============================
// 👨‍💼 ADMIN ROUTES (FIXED)
// ============================

// Admin: Add Movie (GET)
app.get("/admin/add", (req, res) => {
    console.log("📝 Admin add form requested");
    console.log("Admin status:", res.locals.isAdmin);

    if (!res.locals.isAdmin) {
        console.log("❌ Access denied - not admin");
        return res.redirect("/");
    }

    res.render("add", {
        errors: [],
        success: null,
        adminQuery: req.query.admin
    });
});

// Admin: Add Movie (POST) - COMPLETELY REWRITTEN
app.post("/admin/add", async(req, res) => {
    console.log("📤 Movie submission received");
    console.log("Admin status:", res.locals.isAdmin);

    if (!res.locals.isAdmin) {
        console.log("❌ Access denied - not admin");
        return res.redirect("/");
    }

    try {
        console.log("📋 Form data received:", JSON.stringify(req.body, null, 2));

        // Helper functions for data processing
        const processArray = (field) => {
            if (!field) return [];
            if (Array.isArray(field)) return field.filter(item => item && item.trim());
            if (typeof field === 'string') return [field.trim()];
            return [];
        };

        const processStringArray = (field) => {
            if (!field) return [];
            if (typeof field === 'string') {
                return field.split(',').map(item => item.trim()).filter(item => item);
            }
            if (Array.isArray(field)) {
                return field.map(item => item.trim()).filter(item => item);
            }
            return [];
        };

        // Process form data
        const movieData = {
            title: typeof req.body.title === 'string' ? req.body.title.trim() : "",
            description: typeof req.body.description === 'string' ? req.body.description.trim() : "",
            year: parseInt(req.body.year) || 0, // ✅ Year fix
            views: parseInt(req.body.views) || 0,
            downloads: parseInt(req.body.downloads) || 0,
            cast: typeof req.body.cast === 'string' ? req.body.cast.split(',').map(x => x.trim()).filter(Boolean) : [],
            genre: Array.isArray(req.body.genre) ? req.body.genre.map(g => g.trim()) : [],
            movieLanguage: typeof req.body.movieLanguage === 'string' ? req.body.movieLanguage.trim() : "",
            quality: Array.isArray(req.body.quality) ? req.body.quality.map(q => q.trim()) : [],
            poster: typeof req.body.poster === 'string' ? req.body.poster.trim() : "",
            screenshots: Array.isArray(req.body.screenshots) ? req.body.screenshots.map(s => s.trim()).filter(Boolean) : [],
            qualityLinks: {}
        };

        // Fill quality links
        movieData.qualityLinks = {};
        if (req.body.qualityLinks && typeof req.body.qualityLinks === 'object') {
            for (const [quality, link] of Object.entries(req.body.qualityLinks)) {
                if (link && typeof link === 'string' && link.trim().length > 0) {
                    movieData.qualityLinks[quality] = link.trim();
                }
            }
        }



        console.log("🔧 Processed movie data:", JSON.stringify(movieData, null, 2));

        // Validation
        const errors = [];

        if (!movieData.title) errors.push({ msg: "Title is required" });
        if (!movieData.description || movieData.description.length < 10) {
            errors.push({ msg: "Description must be at least 10 characters" });
        }
        if (!movieData.movieLanguage) errors.push({ msg: "Language is required" });
        if (!movieData.genre || movieData.genre.length === 0) {
            errors.push({ msg: "At least one genre is required" });
        }
        if (!movieData.quality || movieData.quality.length === 0) {
            errors.push({ msg: "At least one quality option is required" });
        }
        if (!movieData.poster) errors.push({ msg: "Poster URL is required" });
        if (!movieData.screenshots || movieData.screenshots.length < 3) {
            errors.push({ msg: "At least 3 screenshots are required" });
        }

        if (errors.length > 0) {
            console.log("❌ Validation errors:", errors);
            return res.render("add", {
                errors,
                success: null,
                adminQuery: req.query.admin
            });
        }

        // Create movie
        console.log("💾 Creating movie in database...");
        const newMovie = new Movie(movieData);
        const savedMovie = await newMovie.save();

        console.log("✅ Movie saved successfully with ID:", savedMovie._id);

        res.render("add", {
            errors: [],
            success: "🎉 Movie added successfully!",
            adminQuery: req.query.admin
        });

    } catch (err) {
        console.error("❌ Error adding movie:", err);
        console.error("Error details:", err.message);
        console.error("Stack trace:", err.stack);

        res.render("add", {
            errors: [{ msg: `Error saving movie: ${err.message}` }],
            success: null,
            adminQuery: req.query.admin
        });
    }
});

// Admin: Edit Movie (GET)
app.get("/admin/edit/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).send("Invalid movie ID");
        }

        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).send("Movie not found");

        res.render("edit", { movie, adminQuery: req.query.admin });
    } catch (err) {
        console.error("❌ Error loading edit form:", err);
        res.status(500).send("Error loading edit form");
    }
});

// Admin: Edit Movie (POST)
app.post("/admin/edit/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).send("Invalid movie ID");
        }

        const parseArray = (field) => {
            if (!field) return [];
            if (Array.isArray(field)) return field.filter(item => item && item.trim());
            if (typeof field === 'string') return [field.trim()];
            return [];
        };

        const parseCommaArray = (field) => {
            if (!field) return [];
            if (typeof field === 'string') {
                return field.split(',').map(item => item.trim()).filter(item => item);
            }
            if (Array.isArray(field)) {
                return field.map(item => item.trim()).filter(item => item);
            }
            return [];
        };

        const updatedData = {
            title: typeof req.body.title === 'string' ? req.body.title.trim() : "",
            description: typeof req.body.description === 'string' ? req.body.description.trim() : "",
            cast: typeof req.body.cast === 'string' ? req.body.cast.split(',').map(x => x.trim()) : [],
            genre: Array.isArray(req.body.genre) ? req.body.genre.map(g => g.trim()) : [],
            movieLanguage: typeof req.body.movieLanguage === 'string' ? req.body.movieLanguage.trim() : "",
            quality: Array.isArray(req.body.quality) ? req.body.quality.map(q => q.trim()) : [],
            poster: typeof req.body.poster === 'string' ? req.body.poster.trim() : "",
            screenshots: Array.isArray(req.body.screenshots) ? req.body.screenshots.map(s => s.trim()).filter(Boolean) : [],
            views: parseInt(req.body.views) || 0, // ✅ Add this
            downloads: parseInt(req.body.downloads) || 0, // ✅ Add this
            qualityLinks: {}
        };


        await Movie.findByIdAndUpdate(req.params.id, updatedData);
        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("❌ Error updating movie:", err);
        res.status(500).send("Failed to update movie");
    }
});

// Admin: Delete Movie
app.get("/admin/delete/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).send("Invalid movie ID");
        }

        await Movie.findByIdAndDelete(req.params.id);
        console.log("🗑️ Movie deleted:", req.params.id);
        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("❌ Error deleting movie:", err);
        res.status(500).send("Failed to delete movie");
    }
});

// ============================
// 🎬 MOVIE DETAILS & DOWNLOAD
// ============================
app.get("/movies/:id", async(req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).render("error", { message: "Invalid movie ID" });
        }

        const movie = await Movie.findById(req.params.id);
        if (!movie) {
            return res.status(404).render("error", { message: "Movie not found" });
        }

        const suggestions = await Movie.find({
            _id: { $ne: movie._id },
            $or: [
                { genre: { $in: movie.genre } },
                { movieLanguage: movie.movieLanguage },
            ],
        }).limit(6);

        res.render("details", { movie, suggestions });
    } catch (err) {
        console.error("❌ Error loading movie details:", err);
        res.status(500).render("error", { message: "Something went wrong" });
    }
});

// Download Page
app.get("/movies/download/:id", async(req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).render("error", { message: "Invalid movie ID" });
        }

        const movie = await Movie.findById(req.params.id).lean();
        if (!movie) {
            return res.status(404).render("error", { message: "Movie not found" });
        }

        if (!movie.qualityLinks || Object.keys(movie.qualityLinks).length === 0) {
            return res.status(400).render("error", {
                message: "No download links found for this movie."
            });
        }

        res.render("download", { movie });
    } catch (err) {
        console.error("❌ Error rendering download page:", err);
        res.status(500).render("error", { message: "Internal Server Error" });
    }
});

// ============================
// 📄 STATIC PAGES
// ============================
app.get("/about-us", (req, res) => {
    res.render("about");
});

app.get("/privacy-policy", (req, res) => {
    res.render("privacy");
});

// ============================
// 🔧 DEBUG ROUTES
// ============================

// Database Status Check
app.get("/debug/db-status", async(req, res) => {
    try {
        const movieCount = await Movie.countDocuments();
        const sampleMovies = await Movie.find().limit(3);

        res.json({
            status: "Connected",
            movieCount,
            sampleMovies: sampleMovies.map(m => ({
                id: m._id,
                title: m.title,
                createdAt: m.createdAt
            }))
        });
    } catch (err) {
        res.status(500).json({
            status: "Error",
            error: err.message
        });
    }
});

// Test Movie Creation
app.get("/debug/test-movie", async(req, res) => {
    try {
        const testMovie = await Movie.create({
            title: "Debug Test Movie " + Date.now(),
            description: "This is a test movie created for debugging purposes.",
            cast: ["Test Actor 1", "Test Actor 2"],
            genre: ["Action", "Drama"],
            movieLanguage: "English",
            quality: ["720p", "1080p"],
            poster: "https://via.placeholder.com/300x450?text=Test+Movie",
            screenshots: [
                "https://via.placeholder.com/800x450?text=Screenshot+1",
                "https://via.placeholder.com/800x450?text=Screenshot+2",
                "https://via.placeholder.com/800x450?text=Screenshot+3"
            ],
            qualityLinks: {
                "720p": "https://example.com/720p",
                "1080p": "https://example.com/1080p"
            }
        });

        res.json({
            success: true,
            message: "Test movie created successfully",
            movieId: testMovie._id
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// ============================
// 🌱 IMPROVED SEEDER
// ============================
app.get("/seed", async(req, res) => {
    try {
        // Clear existing data first (optional)
        if (req.query.clear === 'true') {
            await Movie.deleteMany({});
            console.log("🧹 Cleared existing movies");
        }

        const sampleMovies = [{
                title: "Pushpa 2: The Rise",
                description: "Pushpa returns with more action, drama, and intensity in this highly anticipated sequel.",
                cast: ["Allu Arjun", "Rashmika Mandanna", "Fahadh Faasil"],
                genre: ["Action", "Drama", "Thriller"],
                movieLanguage: "Hindi",
                quality: ["480p", "720p", "1080p"],
                poster: "https://via.placeholder.com/300x450?text=Pushpa+2",
                screenshots: [
                    "https://via.placeholder.com/800x450?text=Pushpa+2+Scene+1",
                    "https://via.placeholder.com/800x450?text=Pushpa+2+Scene+2",
                    "https://via.placeholder.com/800x450?text=Pushpa+2+Scene+3"
                ],
                qualityLinks: {
                    "480p": "https://example.com/pushpa2-480p",
                    "720p": "https://example.com/pushpa2-720p",
                    "1080p": "https://example.com/pushpa2-1080p"
                }
            },
            {
                title: "RRR",
                description: "A fictional story about two Indian revolutionaries, Alluri Sitarama Raju and Komaram Bheem.",
                cast: ["N. T. Rama Rao Jr.", "Ram Charan", "Alia Bhatt"],
                genre: ["Action", "Drama", "History"],
                movieLanguage: "Hindi",
                quality: ["720p", "1080p", "4K"],
                poster: "https://via.placeholder.com/300x450?text=RRR",
                screenshots: [
                    "https://via.placeholder.com/800x450?text=RRR+Scene+1",
                    "https://via.placeholder.com/800x450?text=RRR+Scene+2",
                    "https://via.placeholder.com/800x450?text=RRR+Scene+3"
                ],
                qualityLinks: {
                    "720p": "https://example.com/rrr-720p",
                    "1080p": "https://example.com/rrr-1080p",
                    "4K": "https://example.com/rrr-4k"
                }
            },
            {
                title: "KGF Chapter 2",
                description: "The continuation of Rocky's journey as he rises to become the most feared and powerful man in the goldfields.",
                cast: ["Yash", "Sanjay Dutt", "Srinidhi Shetty"],
                genre: ["Action", "Crime", "Drama"],
                movieLanguage: "Hindi",
                quality: ["480p", "720p", "1080p"],
                poster: "https://via.placeholder.com/300x450?text=KGF+2",
                screenshots: [
                    "https://via.placeholder.com/800x450?text=KGF+2+Scene+1",
                    "https://via.placeholder.com/800x450?text=KGF+2+Scene+2",
                    "https://via.placeholder.com/800x450?text=KGF+2+Scene+3"
                ],
                qualityLinks: {
                    "480p": "https://example.com/kgf2-480p",
                    "720p": "https://example.com/kgf2-720p",
                    "1080p": "https://example.com/kgf2-1080p"
                }
            }
        ];

        const createdMovies = await Movie.insertMany(sampleMovies);

        res.json({
            success: true,
            message: `✅ Successfully added ${createdMovies.length} movies!`,
            movies: createdMovies.map(m => ({ id: m._id, title: m.title }))
        });

    } catch (err) {
        console.error("❌ Error seeding data:", err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// ============================
// 🚫 ERROR HANDLING
// ============================
app.use((req, res) => {
    res.status(404).render("404");
});

app.use((err, req, res, next) => {
    console.error("💥 Unhandled error:", err);
    res.status(500).render("error", {
        message: "Something went wrong!",
        statusCode: 500
    });
});

// ============================
// 🚀 START SERVER
// ============================
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`🔧 Debug routes available:`);
    console.log(`   - GET /debug/db-status - Check database connection`);
    console.log(`   - GET /debug/test-movie - Create a test movie`);
    console.log(`   - GET /seed - Add sample movies`);
    console.log(`   - GET /seed?clear=true - Clear and add sample movies`);
});