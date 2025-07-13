// app.js
import express from "express";
import mongoose from "mongoose";
import path from "path";
import Movie from "./models/movies.js";
import adminAuth from "./middleware/adminAuth.js";
import bodyParser from "body-parser";

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(adminAuth); // Adds res.locals.isAdmin

// MongoDB Connection
mongoose.connect(
        process.env.MONGO_URL ||
        "mongodb+srv://deloarhossen:8PwxJE5xWkALIPK@watchview.x1xjpmm.mongodb.net/watchview?retryWrites=true&w=majority&appName=watchview"
    )
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.error("❌ MongoDB Error:", err));

// Homepage
app.get("/", async(req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const searchQuery = req.query.search || "";
        const category = req.query.category;

        const query = {
            ...(searchQuery && { title: { $regex: searchQuery, $options: "i" } }),
            ...(category && category !== "All Movies" && {
                genre: { $regex: category, $options: "i" },
            }),
        };

        const movies = await Movie.find(query)
            .skip((page - 1) * limit)
            .limit(limit);
        const totalMovies = await Movie.countDocuments(query);
        const totalPages = Math.ceil(totalMovies / limit);
        const trendingMovies = await Movie.find().sort({ createdAt: -1 }).limit(4);

        res.render("home", {
            movies,
            trendingMovies,
            currentPage: page,
            totalPages,
            searchQuery,
        });
    } catch (err) {
        res.status(500).send("Error loading homepage");
    }
});

// Dummy Seeder
app.get("/seed", async(req, res) => {
    await Movie.create({
        title: "Pushpa 2",
        description: "Pushpa returns with more action and drama!",
        cast: ["Allu Arjun"],
        genre: ["South Hindi Dubbed", "Action"],
        movieLanguage: "Hindi",
        quality: ["480p", "720p", "1080p"],
        poster: "https://i.imgur.com/P5cL4pp.jpeg",
        screenshots: [
            "https://i.imgur.com/3Q1JJoE.jpg",
            "https://i.imgur.com/uXjlzJq.jpg",
        ],
        qualityLinks: {
            "480p": "https://drive.google.com/480plink",
            "720p": "https://drive.google.com/720plink",
            "1080p": "https://drive.google.com/1080plink",
        },
    });
    res.send("✅ Dummy movie added!");
});

// Details Page
app.get("/movies/:id", async(req, res) => {
    try {
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
        res.status(500).send("Something went wrong");
    }
});

// Download Page
app.get("/download/:id", async(req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).send("Movie not found");
        res.render("download", { movie });
    } catch (err) {
        res.status(500).send("Error loading download page");
    }
});

// Admin Routes
// Add Movie Form
app.get("/admin/add", (req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");
    res.render("add", { adminQuery: req.query.admin });
});
// Add Movie Handler
app.post("/admin/add", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        const { screenshots } = req.body;

        // ✅ Make sure screenshots is always an array and at least 3 are filled
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
            qualityLinks: req.body.qualityLinks,
        };

        await Movie.create(movieData);
        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("❌ Failed to add movie:", err.message);
        res.status(500).send("Failed to add movie");
    }
});


// Edit Movie Form
app.get("/admin/edit/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).send("Movie not found");
    res.render("edit", { movie, adminQuery: req.query.admin });
});

// Edit Movie Handler
app.post("/admin/edit/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        const updatedData = {
            ...req.body,
            cast: req.body.cast.split(",").map((s) => s.trim()),
            genre: req.body.genre.split(",").map((s) => s.trim()),
            quality: req.body.quality.split(",").map((s) => s.trim()),
            screenshots: req.body.screenshots.split(",").map((s) => s.trim()),
            qualityLinks: req.body.qualityLinks,
        };

        await Movie.findByIdAndUpdate(req.params.id, updatedData);
        res.redirect("/?admin=8892"); // ✅ Keep admin flag
    } catch (err) {
        res.status(500).send("Failed to update movie");
    }
});

// Delete Movie
app.get("/admin/delete/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");
    await Movie.findByIdAndDelete(req.params.id);
    res.redirect("/?admin=8892"); // ✅ Keep admin flag
});

// Static Pages
app.get("/about-us", (req, res) => {
    res.render("about");
});
app.get("/privacy-policy", (req, res) => {
    res.render("privacy");
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});