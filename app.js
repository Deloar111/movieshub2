// app.js
import express from "express";
import mongoose from "mongoose";
import path from "path";
import bodyParser from "body-parser";
import lodash from "lodash";
import Movie from "./models/movies.js";
import adminAuth from "./middleware/adminAuth.js";
import movieRoutes from "./routes/movies.js";

const { escapeRegExp } = lodash;
const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

// Middleware Setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(adminAuth); // Sets res.locals.isAdmin

// ============================
// 🔧 FAVICON AND STATIC FILES HANDLING
// ============================
// Handle favicon request before other routes
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content
    // Or serve an actual favicon file:
    // res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

// MongoDB Connection (Preserved your original connection)
mongoose
    .connect(
        process.env.MONGO_URL ||
        "mongodb+srv://deloarhossen:8PwxJE5xWkALIPK@watchview.x1xjpmm.mongodb.net/watchview?retryWrites=true&w=majority&appName=watchview"
    )
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.error("❌ MongoDB Error:", err));

// ============================
// 🏠 HOMEPAGE WITH SMART SEARCH
// ============================
app.get("/", async(req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 14;
        const searchQuery = (req.query.search || "").trim();
        const category = req.query.category;

        let movies = [];
        let totalMovies = 0;

        if (searchQuery) {
            const escapedSearch = escapeRegExp(searchQuery);

            const startsWithMatches = await Movie.find({
                title: { $regex: "^" + escapedSearch, $options: "i" },
                ...(category && category !== "All Movies" && {
                    genre: { $regex: category, $options: "i" },
                }),
            });

            const containsMatches = await Movie.find({
                title: { $regex: escapedSearch, $options: "i" },
                _id: { $nin: startsWithMatches.map((m) => m._id) },
                ...(category && category !== "All Movies" && {
                    genre: { $regex: category, $options: "i" },
                }),
            });

            const combinedResults = [...startsWithMatches, ...containsMatches];
            totalMovies = combinedResults.length;
            movies = combinedResults.slice((page - 1) * limit, page * limit);
        } else {
            const query = {};
            if (category && category !== "All Movies") {
                query.genre = { $regex: category, $options: "i" };
            }

            totalMovies = await Movie.countDocuments(query);
            movies = await Movie.find(query)
                .sort({ title: 1 })
                .skip((page - 1) * limit)
                .limit(limit);
        }

        const totalPages = Math.ceil(totalMovies / limit);
        const trendingMovies = !searchQuery && !category ?
            await Movie.find().sort({ createdAt: -1 }).limit(4) : [];

        res.render("home", {
            movies,
            trendingMovies,
            currentPage: page,
            totalPages,
            searchQuery,
            category,
            isAdmin: res.locals.isAdmin,
        });
    } catch (err) {
        console.error("❌ Error loading homepage:", err);
        res.status(500).send("Error loading homepage");
    }
});

// ============================
// 👨‍💼 ADMIN ROUTES (Main app level)
// ============================

// Admin: Add Movie (GET - Show Form)
app.get("/admin/add", (req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");
    res.render("add", { adminQuery: req.query.admin });
});

// Admin: Add Movie (POST - Handle Form Submission)
app.post("/admin/add", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        const { screenshots } = req.body;
        const validScreenshots = Array.isArray(screenshots) ?
            screenshots.filter((s) => s.trim()) :
            screenshots ? [screenshots.trim()] : [];

        const movieData = {
            ...req.body,
            cast: req.body.cast ? req.body.cast.split(",").map((s) => s.trim()) : [],
            genre: req.body.genre ? req.body.genre.split(",").map((s) => s.trim()) : [],
            quality: req.body.quality ? req.body.quality.split(",").map((s) => s.trim()) : [],
            screenshots: validScreenshots,
            qualityLinks: req.body.qualityLinks,
        };

        await Movie.create(movieData);
        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("❌ Error adding movie:", err);
        res.status(500).send("Failed to add movie");
    }
});

// Admin: Edit Movie (GET - Show Form)
app.get("/admin/edit/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        // Validate ObjectId format
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

// Admin: Edit Movie (POST - Handle Form Submission)
app.post("/admin/edit/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).send("Invalid movie ID");
        }

        const { screenshots } = req.body;
        const validScreenshots = Array.isArray(screenshots) ?
            screenshots.filter((s) => s.trim()) :
            screenshots ? [screenshots.trim()] : [];

        const updatedData = {
            ...req.body,
            cast: req.body.cast ? req.body.cast.split(",").map((s) => s.trim()) : [],
            genre: req.body.genre ? req.body.genre.split(",").map((s) => s.trim()) : [],
            quality: req.body.quality ? req.body.quality.split(",").map((s) => s.trim()) : [],
            screenshots: validScreenshots,
            qualityLinks: req.body.qualityLinks,
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
        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).send("Invalid movie ID");
        }

        await Movie.findByIdAndDelete(req.params.id);
        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("❌ Error deleting movie:", err);
        res.status(500).send("Failed to delete movie");
    }
});

// ============================
// 🎬 MOVIE DETAILS & DOWNLOAD (Simplified for main app)
// ============================
app.get("/movies/:id", async(req, res) => {
    try {
        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).send("Invalid movie ID");
        }

        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).send("Movie not found");

        const suggestions = await Movie.find({
            _id: { $ne: movie._id },
            $or: [
                { genre: { $in: movie.genre } },
                { movieLanguage: movie.movieLanguage },
            ],
        }).limit(6);

        res.render("details", { movie, suggestions });
    } catch (err) {
        console.error("Error loading movie details:", err);
        res.status(500).send("Something went wrong");
    }
});

// Enhanced Download Page
app.get("/movies/download/:id", async(req, res) => {
    try {
        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).send("Invalid movie ID");
        }

        const movieId = req.params.id;
        const movie = await Movie.findById(movieId).lean();

        if (!movie) {
            return res.status(404).send("Movie not found");
        }

        if (!movie.qualityLinks || Object.keys(movie.qualityLinks).length === 0) {
            return res.status(400).send("No download links found for this movie.");
        }

        res.render("download", { movie });
    } catch (err) {
        console.error("🚨 Error rendering download page:", err);
        return res.status(500).send("Internal Server Error");
    }
});

// ============================
// 📄 STATIC PAGES ROUTES - Alternative URLs
// ============================
app.get("/about-us", (req, res) => {
    res.render("about");
});

app.get("/privacy-policy", (req, res) => {
    res.render("privacy");
});

// ============================
// 🌱 DEVELOPMENT SEEDER
// ============================
app.get("/seed", async(req, res) => {
    try {
        await Movie.create({
            title: "Pushpa 2",
            description: "Pushpa returns with more action and drama!",
            cast: ["Allu Arjun"],
            genre: ["Action"], // Fixed: Use valid genre from schema
            movieLanguage: "Hindi",
            quality: ["480p", "720p", "1080p"],
            poster: "https://i.imgur.com/P5cL4pp.jpeg",
            screenshots: [
                "https://i.imgur.com/3Q1JJoE.jpg",
                "https://i.imgur.com/uXjlzJq.jpg",
                "https://i.imgur.com/a1z9HkR.jpg",
            ],
            qualityLinks: {
                "480p": "https://drive.google.com/480plink",
                "720p": "https://drive.google.com/720plink",
                "1080p": "https://drive.google.com/1080plink",
            },
        });
        res.send("✅ Dummy movie added!");
    } catch (err) {
        console.error("❌ Error seeding data:", err);
        res.status(500).send("Failed to seed data");
    }
});

// ============================
// 🔗 USE MOVIE ROUTES - This should be LAST
// ============================
// Use movie routes (this will handle the dynamic :id routes)
app.use("/", movieRoutes);

// ============================
// 🚀 START SERVER
// ============================
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});