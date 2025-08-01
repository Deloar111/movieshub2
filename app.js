// app.js - FIXED VERSION WITH WORKING ADMIN AND OFFLINE SUPPORT
import express from "express";
import mongoose from "mongoose";
import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import path from "path";
import bodyParser from "body-parser";
import lodash from "lodash";
import fs from 'fs';

const { escapeRegExp } = lodash;
const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

// ============================
// 🔧 MOVIE SCHEMA DEFINITION
// ============================
const movieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    cast: [String],
    genre: [String],
    movieLanguage: String,
    quality: [String],
    poster: String,
    screenshots: [String],
    year: { type: Number, default: () => new Date().getFullYear() },
    views: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    qualityLinks: {
        type: Map,
        of: String,
        default: () => new Map()
    }
}, {
    timestamps: true
});

const Movie = mongoose.model("Movie", movieSchema);

// ============================
// 🔐 ADMIN AUTHENTICATION MIDDLEWARE
// ============================
function adminAuth(req, res, next) {
    try {
        const adminQuery = req.query.admin;
        const adminPassword = "8892"; // Change this to your desired admin password

        // Check if admin parameter matches
        const isAdmin = adminQuery === adminPassword;

        console.log(`🔐 Admin auth check: Query="${adminQuery}", IsAdmin=${isAdmin}`);

        res.locals.isAdmin = isAdmin;
        next();
    } catch (err) {
        console.error('❌ AdminAuth error:', err.message);
        res.locals.isAdmin = false;
        next();
    }
}

// 📁 OFFLINE MOVIE STORAGE SETUP
// ============================
const moviesBackupFile = path.join(__dirname, 'movies_backup.json');
const configFile = path.join(__dirname, 'config.json');
let offlineMovies = [];
let isMongoConnected = false;
let useOfflineMode = false;

// Load movies from backup file
function loadMoviesFromFile() {
    try {
        if (fs.existsSync(moviesBackupFile)) {
            const data = fs.readFileSync(moviesBackupFile, 'utf8');
            const parsed = JSON.parse(data);
            offlineMovies = Array.isArray(parsed) ? parsed : [];
            console.log(`📁 Loaded ${offlineMovies.length} movies from backup file`);
            return true;
        } else {
            console.log('📁 No movies backup file found, creating empty backup');
            offlineMovies = [];
            saveMoviesToFile(); // Create empty file
        }
    } catch (error) {
        console.error('❌ Error loading movies from file:', error);
        offlineMovies = [];
    }
    return false;
}

// Save movies to backup file
function saveMoviesToFile() {
    try {
        fs.writeFileSync(moviesBackupFile, JSON.stringify(offlineMovies, null, 2));
        console.log(`💾 Saved ${offlineMovies.length} movies to backup file`);
    } catch (error) {
        console.error('❌ Error saving movies to file:', error);
    }
}

// Sync movies from MongoDB to backup file
// Sync movies from MongoDB to backup file
async function syncMoviesToFile() {
    try {
        if (isMongoConnected) {
            const mongoMovies = await Movie.find({}).lean();
            offlineMovies = mongoMovies.map(movie => ({
                ...movie,
                _id: movie._id.toString(),
                // Fix: Just use the qualityLinks object directly, no need for Object.fromEntries
                qualityLinks: movie.qualityLinks || {}
            }));
            saveMoviesToFile();
            console.log(`🔄 Synced ${offlineMovies.length} movies from MongoDB to backup file`);
        }
    } catch (error) {
        console.error('❌ Error syncing movies to file:', error);
    }
}

// FIXED: Enhanced offline search function
function searchMoviesOffline(query) {
    if (!query || !query.trim()) {
        console.log('📋 Returning all offline movies (no search query)');
        return offlineMovies.slice(0, 20);
    }

    const searchTerm = query.toLowerCase().trim();
    console.log(`🔍 Searching offline movies for: "${searchTerm}"`);
    console.log(`📚 Total offline movies available: ${offlineMovies.length}`);

    const results = offlineMovies.filter(movie => {
        if (!movie) return false;

        const titleMatch = movie.title && movie.title.toLowerCase().includes(searchTerm);
        const descriptionMatch = movie.description && movie.description.toLowerCase().includes(searchTerm);

        // Handle cast array properly
        const castMatch = Array.isArray(movie.cast) &&
            movie.cast.some(actor =>
                actor && typeof actor === 'string' && actor.toLowerCase().includes(searchTerm)
            );

        // Handle genre array properly
        const genreMatch = Array.isArray(movie.genre) &&
            movie.genre.some(g =>
                g && typeof g === 'string' && g.toLowerCase().includes(searchTerm)
            );

        // Language match
        const languageMatch = movie.movieLanguage &&
            movie.movieLanguage.toLowerCase().includes(searchTerm);

        return titleMatch || descriptionMatch || castMatch || genreMatch || languageMatch;
    });

    console.log(`🎯 Found ${results.length} matching movies offline`);
    return results.slice(0, 20);
}

// ============================
// 🤖 TELEGRAM BOT SETUP (ENHANCED)
// ============================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '7965399127:AAH_4SSjYKZshPMl1Cvouu9SS3naJpvi6m0';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const NOTIFICATION_CHAT_ID = 6375810452;

// ============================
// 🔧 MIDDLEWARE SETUP
// ============================
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));

// FIXED: Admin authentication middleware
app.use((req, res, next) => {
    try {
        adminAuth(req, res, next);
    } catch (err) {
        console.log('⚠️ AdminAuth middleware error:', err.message);
        res.locals.isAdmin = false;
        next();
    }
});

// ============================
// 🌐 SEO & STATIC ROUTES
// ============================
app.get('/sitemap.xml', (req, res) => {
    res.header('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://moviemods.onrender.com/</loc>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
</urlset>`);
});

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// ============================
// 🔗 MONGODB CONNECTION (ENHANCED)
// ============================
const connectDB = async() => {
    try {
        const mongoUrl = process.env.MONGO_URL ||
            "mongodb+srv://deloarhossen:8PwxJE5xWkALIPK@watchview.x1xjpmm.mongodb.net/watchview?retryWrites=true&w=majority&appName=watchview";

        await mongoose.connect(mongoUrl);
        isMongoConnected = true;
        console.log("✅ MongoDB Connected Successfully");

        const movieCount = await Movie.countDocuments();
        console.log(`📊 Current movies in database: ${movieCount}`);

        // Sync movies to backup file
        await syncMoviesToFile();

        // Start bot watchers after DB connection
        startBotWatcher();
        startBotSearchListener();

    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
        isMongoConnected = false;
        useOfflineMode = true;

        // Load from backup file if MongoDB fails
        const loaded = loadMoviesFromFile();
        console.log(`🔴 Using offline mode with backup file (${offlineMovies.length} movies loaded)`);

        // Start bot search listener even in offline mode
        startBotSearchListener();
    }
};

// ============================
// 🤖 TELEGRAM BOT FUNCTIONS (ENHANCED)
// ============================

// Bot watcher for new movie notifications
async function startBotWatcher() {
    if (!isMongoConnected) {
        console.log('🔴 MongoDB not connected - skipping bot watcher');
        return;
    }

    try {
        console.log('🤖 Starting Telegram bot watcher...');
        await bot.sendMessage(NOTIFICATION_CHAT_ID, '🤖 Bot is now watching for new movies!');
        console.log('✅ Telegram bot watcher is active');

        const changeStream = Movie.watch();

        changeStream.on('change', async(data) => {
            console.log('📡 Database change detected:', data.operationType);

            if (data.operationType === 'insert') {
                const movie = data.fullDocument;
                console.log(`🎬 New movie added: ${movie.title}`);

                // Add to offline backup
                const movieForBackup = {
                    ...movie,
                    _id: movie._id.toString(),
                    qualityLinks: typeof movie.qualityLinks === 'object' ? movie.qualityLinks : {}

                };
                offlineMovies.push(movieForBackup);
                saveMoviesToFile();

                const link = `https://moviemods.onrender.com/movies/download/${movie._id}`;
                const genre = Array.isArray(movie.genre) ? movie.genre.join(', ') : movie.genre || 'N/A';
                const language = movie.movieLanguage || 'N/A';
                const year = movie.year || 'N/A';
                const title = movie.title || 'Untitled';

                const caption = `🎬 *${title}*\n📅 Year: ${year}\n🎭 Genre: ${genre}\n🌐 Language: ${language}\n📥 [Download Movie](${link})`;

                try {
                    if (movie.poster && movie.poster.startsWith('http')) {
                        await bot.sendPhoto(NOTIFICATION_CHAT_ID, movie.poster, {
                            caption,
                            parse_mode: 'Markdown'
                        });
                    } else {
                        await bot.sendMessage(NOTIFICATION_CHAT_ID, caption, { parse_mode: 'Markdown' });
                    }
                    console.log(`✅ Telegram notification sent for: ${title}`);
                } catch (err) {
                    console.error('❌ Telegram send error:', err.message);
                }
            }
        });

        changeStream.on('error', (error) => {
            console.error('❌ Change stream error:', error);
        });

    } catch (error) {
        console.error('❌ Bot watcher error:', error.message);
    }
}

// Enhanced bot search listener (works offline and online)
async function startBotSearchListener() {
    const mode = isMongoConnected ? 'Online' : 'Offline';
    console.log(`🔍 Starting Telegram search listener in ${mode} mode...`);

    // Bot commands
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const status = isMongoConnected ? '🟢 Online' : '🔴 Offline';
        const movieCount = isMongoConnected ? 'Loading...' : offlineMovies.length;

        bot.sendMessage(chatId, `🎬 Movie Bot ${status}

Welcome! I can find movies for you!

🔍 Search: Just type a movie name
📋 /list - Show available movies  
ℹ️ /status - Check bot status
🔄 /reconnect - Try reconnect (if offline)

Available movies: ${movieCount}`, { parse_mode: 'Markdown' });
    });

    // Status command
    bot.onText(/\/status/, (msg) => {
        const chatId = msg.chat.id;
        const status = isMongoConnected ? '🟢 Online (MongoDB)' : '🔴 Offline (Backup file)';
        const movieCount = isMongoConnected ? 'Fetching...' : offlineMovies.length;

        bot.sendMessage(chatId, `Bot Status: ${status}
Movies available: ${movieCount}
Last updated: ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
    });

    // List command
    bot.onText(/\/list/, async(msg) => {
        const chatId = msg.chat.id;

        try {
            let movies = [];

            if (isMongoConnected) {
                movies = await Movie.find().sort({ createdAt: -1 }).limit(10);
            } else {
                movies = offlineMovies.slice(0, 10);
            }

            if (movies.length === 0) {
                return bot.sendMessage(chatId, '❌ No movies available');
            }

            let response = `📚 Available Movies (${movies.length}):\n\n`;

            movies.forEach((movie, index) => {
                response += `${index + 1}. 🎥 ${movie.title}`;
                if (movie.year) response += ` (${movie.year})`;
                response += `\n`;
            });

            bot.sendMessage(chatId, response);

        } catch (error) {
            console.error('❌ List command error:', error);
            bot.sendMessage(chatId, '⚠️ Error loading movie list');
        }
    });

    // Search functionality (main message handler)
    bot.on('message', async(msg) => {
        const chatId = msg.chat.id;
        const query = typeof msg.text === 'string' ? msg.text.trim() : '';

        // Ignore empty or command messages
        if (!query || query.startsWith('/')) return;

        console.log(`🔍 Search query from ${chatId}: "${query}" (Mode: ${isMongoConnected ? 'Online' : 'Offline'})`);

        try {
            let results = [];

            if (isMongoConnected) {
                // Online search - use MongoDB
                const escapedSearch = escapeRegExp(query);
                const searchFilter = {
                    $or: [
                        { title: { $regex: escapedSearch, $options: "i" } },
                        { description: { $regex: escapedSearch, $options: "i" } },
                        { cast: { $in: [new RegExp(escapedSearch, "i")] } },
                        { genre: { $in: [new RegExp(escapedSearch, "i")] } }
                    ]
                };

                results = await Movie.find(searchFilter).limit(5).sort({ createdAt: -1 });
            } else {
                // Offline search - use backup file
                results = searchMoviesOffline(query).slice(0, 5);
            }

            if (!results || results.length === 0) {
                return bot.sendMessage(chatId, `❌ No results found for *${query}*\n\n💡 Try different keywords\n🔴 Mode: ${isMongoConnected ? 'Online' : 'Offline'}`, { parse_mode: 'Markdown' });
            }

            const mode = isMongoConnected ? '🟢' : '🔴';
            await bot.sendMessage(chatId, `${mode} Found ${results.length} result(s) for *${query}*:`, { parse_mode: 'Markdown' });

            for (const movie of results) {
                const title = movie.title || 'Untitled';
                const year = movie.year || 'N/A';
                const genre = Array.isArray(movie.genre) ? movie.genre.join(', ') : (movie.genre || 'N/A');
                const language = movie.movieLanguage || 'N/A';
                const poster = movie.poster;
                const movieId = movie._id.toString();
                const link = `https://moviemods.onrender.com/movies/download/${movieId}`;

                const caption = [
                    `🎬 *${title}*`,
                    `📅 Year: ${year}`,
                    `🎭 Genre: ${genre}`,
                    `🌐 Language: ${language}`,
                    `📥 [Download Movie](${link})`
                ].join('\n');

                try {
                    if (poster && poster.startsWith('http')) {
                        await bot.sendPhoto(chatId, poster, {
                            caption,
                            parse_mode: 'Markdown'
                        });
                    } else {
                        await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
                    }
                } catch (photoError) {
                    // If photo fails, send text message
                    await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
                }

                // Small delay to avoid flooding
                await new Promise(resolve => setTimeout(resolve, 500));
            }

        } catch (error) {
            console.error('❌ Bot search error:', error.message);
            bot.sendMessage(chatId, '⚠️ An error occurred while searching. Please try again later.');
        }
    });

    console.log(`✅ Telegram search listener is active (${mode} mode)`);
}

// ============================
// 🔍 API ENDPOINTS (ENHANCED FOR OFFLINE SUPPORT)
// ============================

// FIXED: API endpoint for movie search
app.get("/api/search", async(req, res) => {
    try {
        const query = req.query.q || '';

        console.log(`🔍 API Search query: "${query}" (Mode: ${isMongoConnected ? 'Online' : 'Offline'})`);

        if (!query.trim()) {
            console.log('📋 Empty search query, returning empty array');
            return res.json([]);
        }

        let movies = [];

        if (isMongoConnected) {
            // Online search
            const escapedSearch = escapeRegExp(query);
            const searchFilter = {
                $or: [
                    { title: { $regex: escapedSearch, $options: "i" } },
                    { description: { $regex: escapedSearch, $options: "i" } },
                    { cast: { $in: [new RegExp(escapedSearch, "i")] } },
                    { genre: { $in: [new RegExp(escapedSearch, "i")] } }
                ]
            };

            movies = await Movie.find(searchFilter).sort({ createdAt: -1 }).limit(20);
        } else {
            // Offline search
            movies = searchMoviesOffline(query);
        }

        console.log(`📊 API Search results: ${movies.length} movies found`);
        res.json(movies);

    } catch (err) {
        console.error("❌ API Search Error:", err);
        res.status(500).json({ error: "Search failed" });
    }
});

// API endpoint to get all movies
app.get("/api/movies", async(req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        let movies = [];
        let total = 0;

        if (isMongoConnected) {
            movies = await Movie.find().sort({ createdAt: -1 }).skip(skip).limit(limit);
            total = await Movie.countDocuments();
        } else {
            total = offlineMovies.length;
            movies = offlineMovies.slice(skip, skip + limit);
        }

        res.json({
            movies,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalMovies: total
            },
            mode: isMongoConnected ? 'online' : 'offline'
        });

    } catch (err) {
        console.error("❌ API Movies Error:", err);
        res.status(500).json({ error: "Failed to fetch movies" });
    }
});

// ============================
// 🏠 HOMEPAGE (FIXED FOR OFFLINE SUPPORT)
// ============================
app.get("/", async(req, res) => {
    try {
        console.log("📥 Homepage request received");
        console.log("Query params:", req.query);
        console.log(`🔧 Mode: ${isMongoConnected ? 'Online' : 'Offline'} | Movies available: ${isMongoConnected ? 'Loading...' : offlineMovies.length}`);
        console.log(`👨‍💼 Admin status: ${res.locals.isAdmin}`);

        const page = parseInt(req.query.page) || 1;
        const limit = 14;
        const searchQuery = (req.query.search || "").trim();
        const category = req.query.category;

        console.log(`🔍 Search params - Page: ${page}, Search: "${searchQuery}", Category: "${category}"`);

        let movies = [];
        let totalMovies = 0;

        if (isMongoConnected) {
            // Use MongoDB logic (original code)
            if (searchQuery) {
                console.log("🔍 Performing MongoDB search query...");
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
                console.log(`🔍 MongoDB search results: ${movies.length} movies found`);

            } else {
                console.log("📋 Loading all movies from MongoDB...");
                const query = {};

                if (category && category !== "All Movies") {
                    query.genre = { $regex: category, $options: "i" };
                    console.log(`📂 Filtering by category: ${category}`);
                }

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
        } else {
            // FIXED: Use offline mode
            console.log("🔴 Using offline mode for homepage");
            console.log(`📚 Available offline movies: ${offlineMovies.length}`);

            let filteredMovies = [...offlineMovies]; // Create a copy

            if (searchQuery) {
                console.log(`🔍 Performing offline search for: "${searchQuery}"`);
                filteredMovies = searchMoviesOffline(searchQuery);
                console.log(`🔍 Offline search results: ${filteredMovies.length} movies found`);
            }

            if (category && category !== "All Movies") {
                console.log(`📂 Filtering offline movies by category: ${category}`);
                filteredMovies = filteredMovies.filter(movie =>
                    movie.genre && Array.isArray(movie.genre) &&
                    movie.genre.some(g => g && g.toLowerCase().includes(category.toLowerCase()))
                );
                console.log(`📂 Category filter results: ${filteredMovies.length} movies`);
            }

            totalMovies = filteredMovies.length;
            const skip = (page - 1) * limit;
            movies = filteredMovies.slice(skip, skip + limit);

            console.log(`📊 Offline pagination: Total ${totalMovies}, Page ${page}, Showing ${movies.length}`);
        }

        const totalPages = Math.ceil(totalMovies / limit);

        // Get trending movies
        const trendingMovies = !searchQuery && !category ?
            (isMongoConnected ?
                await Movie.find().sort({ createdAt: -1 }).limit(4) :
                offlineMovies.slice(0, 4)
            ) : [];

        console.log(`🎬 Trending movies: ${trendingMovies.length}`);
        console.log(`👨‍💼 Final admin status: ${res.locals.isAdmin}`);
        console.log(`📊 Final results: Mode: ${isMongoConnected ? 'Online' : 'Offline'}, Movies: ${movies.length}, Total: ${totalMovies}`);

        res.render("home", {
            movies,
            trendingMovies,
            currentPage: page,
            totalPages,
            searchQuery,
            category,
            isAdmin: res.locals.isAdmin || false,
            isOffline: !isMongoConnected,
            totalMovies: totalMovies
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

// Initialize everything
async function initializeApp() {
    console.log('🚀 Initializing MovieMods App...');

    // First load offline backup
    const loaded = loadMoviesFromFile();
    console.log(`📁 Offline backup status: ${loaded ? 'Loaded' : 'Empty'} (${offlineMovies.length} movies)`);

    // Then try to connect to MongoDB
    await connectDB();

    console.log(`🎬 App initialized in ${isMongoConnected ? 'Online' : 'Offline'} mode`);
    console.log(`📚 Movies available: ${isMongoConnected ? 'Loading from DB...' : offlineMovies.length}`);
}

// ============================
// REST OF YOUR ROUTES (SAME AS BEFORE BUT WITH OFFLINE SUPPORT)
// ============================

// Bot page
app.get("/bot", (req, res) => {
    res.render("bot", {
        isAdmin: res.locals.isAdmin || false
    });
});

// FIXED: Admin routes with proper error handling
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

app.post("/admin/add", async(req, res) => {
    console.log("📤 Movie submission received");
    console.log("Admin status:", res.locals.isAdmin);
    console.log("Request body keys:", Object.keys(req.body));

    if (!res.locals.isAdmin) {
        console.log("❌ Access denied - not admin");
        return res.redirect("/");
    }

    try {
        const movieData = {
            title: typeof req.body.title === 'string' ? req.body.title.trim() : "",
            description: typeof req.body.description === 'string' ? req.body.description.trim() : "",
            year: parseInt(req.body.year) || new Date().getFullYear(),
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

        // Handle quality links
        if (req.body.qualityLinks && typeof req.body.qualityLinks === 'object') {
            for (const [quality, link] of Object.entries(req.body.qualityLinks)) {
                if (link && typeof link === 'string' && link.trim().length > 0) {
                    movieData.qualityLinks[quality] = link.trim();
                }
            }
        }

        const errors = [];

        if (!movieData.title) errors.push({ msg: "Title is required" });
        if (!movieData.description || movieData.description.length < 10) {
            errors.push({ msg: "Description must be at least 10 characters" });
        }
        if (!movieData.movieLanguage) errors.push({ msg: "Language is required" });
        if (!movieData.genre || movieData.genre.length === 0) {
            errors.push({ msg: "At least one genre is required" });
        }

        if (errors.length > 0) {
            console.log("❌ Validation errors:", errors);
            return res.render("add", {
                errors,
                success: null,
                adminQuery: req.query.admin
            });
        }

        console.log("💾 Creating movie...");

        if (isMongoConnected) {
            const newMovie = new Movie(movieData);
            const savedMovie = await newMovie.save();
            console.log("✅ Movie saved to MongoDB with ID:", savedMovie._id);

            // Also add to offline backup
            const movieForBackup = {
                ...savedMovie.toObject(),
                _id: savedMovie._id.toString(),
                qualityLinks: savedMovie.qualityLinks ? Object.fromEntries(savedMovie.qualityLinks) : {}
            };
            offlineMovies.unshift(movieForBackup);
            saveMoviesToFile();
        } else {
            // Save to offline backup only
            const newMovieOffline = {
                ...movieData,
                _id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            offlineMovies.unshift(newMovieOffline);
            saveMoviesToFile();
            console.log("✅ Movie saved to offline backup");
        }

        const message = isMongoConnected ?
            "🎉 Movie added successfully! Telegram notification will be sent automatically." :
            "🎉 Movie added to offline storage! Will sync when database is available.";

        res.render("add", {
            errors: [],
            success: message,
            adminQuery: req.query.admin
        });

    } catch (err) {
        console.error("❌ Error adding movie:", err);
        res.render("add", {
            errors: [{ msg: `Error saving movie: ${err.message}` }],
            success: null,
            adminQuery: req.query.admin
        });
    }
});

// Movie details and download (enhanced for offline support)
app.get("/movies/:id", async(req, res) => {
    try {
        const movieId = req.params.id;
        let movie = null;
        let suggestions = [];

        if (isMongoConnected && mongoose.Types.ObjectId.isValid(movieId)) {
            movie = await Movie.findById(movieId);
            if (movie) {
                suggestions = await Movie.find({
                    _id: { $ne: movie._id },
                    $or: [
                        { genre: { $in: movie.genre } },
                        { movieLanguage: movie.movieLanguage },
                    ],
                }).limit(6);
            }
        } else {
            // Search in offline data
            movie = offlineMovies.find(m => m._id === movieId);
            if (movie) {
                suggestions = offlineMovies.filter(m =>
                    m._id !== movieId && (
                        (m.genre && movie.genre && m.genre.some(g => movie.genre.includes(g))) ||
                        m.movieLanguage === movie.movieLanguage
                    )
                ).slice(0, 6);
            }
        }

        if (!movie) {
            return res.status(404).render("error", {
                message: "Movie not found",
                statusCode: 404
            });
        }

        // Convert movie to plain object if it's from MongoDB
        const movieData = movie.toObject ? movie.toObject() : movie;
        if (movieData.qualityLinks && typeof movieData.qualityLinks === 'object') {
            // Ensure qualityLinks is a plain object
            if (movieData.qualityLinks instanceof Map) {
                movieData.qualityLinks = Object.fromEntries(movieData.qualityLinks);
            }
        }

        res.render("details", {
            movie: movieData,
            suggestions,
            isAdmin: res.locals.isAdmin || false
        });

    } catch (err) {
        console.error("❌ Error loading movie details:", err);
        res.status(500).render("error", {
            message: "Something went wrong",
            statusCode: 500
        });
    }
});

// Download Page (enhanced for offline support)
app.get("/movies/download/:id", async(req, res) => {
    try {
        const movieId = req.params.id;
        let movie = null;

        if (isMongoConnected && mongoose.Types.ObjectId.isValid(movieId)) {
            movie = await Movie.findById(movieId).lean();
        } else {
            // Search in offline data
            movie = offlineMovies.find(m => m._id === movieId);
        }

        if (!movie) {
            return res.status(404).render("error", {
                message: "Movie not found",
                statusCode: 404
            });
        }

        // Handle qualityLinks properly
        let qualityLinks = {};
        if (movie.qualityLinks) {
            if (movie.qualityLinks instanceof Map) {
                qualityLinks = Object.fromEntries(movie.qualityLinks);
            } else if (typeof movie.qualityLinks === 'object') {
                qualityLinks = movie.qualityLinks;
            }
        }

        if (!qualityLinks || Object.keys(qualityLinks).length === 0) {
            return res.status(400).render("error", {
                message: "No download links found for this movie.",
                statusCode: 400
            });
        }

        // Update download count
        if (isMongoConnected && mongoose.Types.ObjectId.isValid(movieId)) {
            await Movie.findByIdAndUpdate(movieId, { $inc: { downloads: 1 } });
        } else {
            // Update in offline storage
            const movieIndex = offlineMovies.findIndex(m => m._id === movieId);
            if (movieIndex !== -1) {
                offlineMovies[movieIndex].downloads = (offlineMovies[movieIndex].downloads || 0) + 1;
                saveMoviesToFile();
            }
        }

        res.render("download", {
            movie: {
                ...movie,
                qualityLinks
            },
            isAdmin: res.locals.isAdmin || false
        });
    } catch (err) {
        console.error("❌ Error rendering download page:", err);
        res.status(500).render("error", {
            message: "Internal Server Error",
            statusCode: 500
        });
    }
});

// Rest of admin routes (enhanced for offline support)
app.get("/admin/edit/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        const movieId = req.params.id;
        let movie = null;

        if (isMongoConnected && mongoose.Types.ObjectId.isValid(movieId)) {
            movie = await Movie.findById(movieId);
        } else {
            movie = offlineMovies.find(m => m._id === movieId);
        }

        if (!movie) return res.status(404).render("error", {
            message: "Movie not found",
            statusCode: 404
        });

        // Convert to plain object and handle qualityLinks
        const movieData = movie.toObject ? movie.toObject() : movie;
        if (movieData.qualityLinks instanceof Map) {
            movieData.qualityLinks = Object.fromEntries(movieData.qualityLinks);
        }

        res.render("edit", {
            movie: movieData,
            adminQuery: req.query.admin,
            errors: [],
            success: null
        });
    } catch (err) {
        console.error("❌ Error loading edit form:", err);
        res.status(500).render("error", {
            message: "Error loading edit form",
            statusCode: 500
        });
    }
});

app.post("/admin/edit/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        const movieId = req.params.id;

        const updatedData = {
            title: typeof req.body.title === 'string' ? req.body.title.trim() : "",
            description: typeof req.body.description === 'string' ? req.body.description.trim() : "",
            cast: typeof req.body.cast === 'string' ? req.body.cast.split(',').map(x => x.trim()).filter(Boolean) : [],
            genre: Array.isArray(req.body.genre) ? req.body.genre.map(g => g.trim()) : [],
            movieLanguage: typeof req.body.movieLanguage === 'string' ? req.body.movieLanguage.trim() : "",
            quality: Array.isArray(req.body.quality) ? req.body.quality.map(q => q.trim()) : [],
            poster: typeof req.body.poster === 'string' ? req.body.poster.trim() : "",
            screenshots: Array.isArray(req.body.screenshots) ? req.body.screenshots.map(s => s.trim()).filter(Boolean) : [],
            views: parseInt(req.body.views) || 0,
            downloads: parseInt(req.body.downloads) || 0,
            year: parseInt(req.body.year) || new Date().getFullYear(),
            qualityLinks: {}
        };

        // Handle quality links
        if (req.body.qualityLinks && typeof req.body.qualityLinks === 'object') {
            for (const [quality, link] of Object.entries(req.body.qualityLinks)) {
                if (link && typeof link === 'string' && link.trim().length > 0) {
                    updatedData.qualityLinks[quality] = link.trim();
                }
            }
        }

        if (isMongoConnected && mongoose.Types.ObjectId.isValid(movieId)) {
            await Movie.findByIdAndUpdate(movieId, updatedData);
            console.log("✅ Movie updated in MongoDB:", movieId);

            // Also update in offline backup
            const movieIndex = offlineMovies.findIndex(m => m._id === movieId);
            if (movieIndex !== -1) {
                offlineMovies[movieIndex] = {
                    ...offlineMovies[movieIndex],
                    ...updatedData,
                    updatedAt: new Date().toISOString()
                };
                saveMoviesToFile();
            }
        } else {
            // Update in offline storage only
            const movieIndex = offlineMovies.findIndex(m => m._id === movieId);
            if (movieIndex !== -1) {
                offlineMovies[movieIndex] = {
                    ...offlineMovies[movieIndex],
                    ...updatedData,
                    updatedAt: new Date().toISOString()
                };
                saveMoviesToFile();
                console.log("✅ Movie updated in offline storage:", movieId);
            }
        }

        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("❌ Error updating movie:", err);
        res.status(500).render("error", {
            message: "Failed to update movie",
            statusCode: 500
        });
    }
});

app.get("/admin/delete/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        const movieId = req.params.id;

        if (isMongoConnected && mongoose.Types.ObjectId.isValid(movieId)) {
            await Movie.findByIdAndDelete(movieId);
            console.log("🗑️ Movie deleted from MongoDB:", movieId);
        }

        // Also remove from offline backup
        const originalLength = offlineMovies.length;
        offlineMovies = offlineMovies.filter(m => m._id !== movieId);

        if (offlineMovies.length < originalLength) {
            saveMoviesToFile();
            console.log("🗑️ Movie deleted from offline storage:", movieId);
        }

        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("❌ Error deleting movie:", err);
        res.status(500).render("error", {
            message: "Failed to delete movie",
            statusCode: 500
        });
    }
});

// ============================
// 📄 STATIC PAGES
// ============================
app.get("/about-us", (req, res) => {
    res.render("about", {
        isAdmin: res.locals.isAdmin || false
    });
});

app.get("/privacy-policy", (req, res) => {
    res.render("privacy", {
        isAdmin: res.locals.isAdmin || false
    });
});

app.get("/dmca", (req, res) => {
    res.render("dmca", {
        isAdmin: res.locals.isAdmin || false
    });
});

// ============================
// 🔧 DEBUG ROUTES (ENHANCED)
// ============================

// Database Status Check
app.get("/debug/db-status", async(req, res) => {
    try {
        let mongoStatus = "Disconnected";
        let movieCount = 0;
        let sampleMovies = [];

        if (isMongoConnected) {
            mongoStatus = "Connected";
            movieCount = await Movie.countDocuments();
            sampleMovies = await Movie.find().limit(3);
        }

        res.json({
            mongodb: {
                status: mongoStatus,
                movieCount,
                sampleMovies: sampleMovies.map(m => ({
                    id: m._id,
                    title: m.title,
                    createdAt: m.createdAt
                }))
            },
            offline: {
                movieCount: offlineMovies.length,
                backupFileExists: fs.existsSync(moviesBackupFile),
                sampleMovies: offlineMovies.slice(0, 3).map(m => ({
                    id: m._id,
                    title: m.title,
                    createdAt: m.createdAt
                }))
            },
            currentMode: isMongoConnected ? 'Online' : 'Offline',
            adminAuth: {
                middleware: 'Working',
                testUrl: '/?admin=8892'
            }
        });
    } catch (err) {
        res.status(500).json({
            status: "Error",
            error: err.message
        });
    }
});

// Test offline search
app.get("/debug/test-search", async(req, res) => {
    const query = req.query.q || 'test';

    try {
        let onlineResults = [];
        let offlineResults = [];

        if (isMongoConnected) {
            const escapedSearch = escapeRegExp(query);
            const searchFilter = {
                $or: [
                    { title: { $regex: escapedSearch, $options: "i" } },
                    { description: { $regex: escapedSearch, $options: "i" } },
                    { cast: { $in: [new RegExp(escapedSearch, "i")] } },
                    { genre: { $in: [new RegExp(escapedSearch, "i")] } }
                ]
            };
            onlineResults = await Movie.find(searchFilter).limit(5);
        }

        offlineResults = searchMoviesOffline(query).slice(0, 5);

        res.json({
            query,
            mode: isMongoConnected ? 'Online' : 'Offline',
            results: {
                online: {
                    count: onlineResults.length,
                    movies: onlineResults.map(m => ({ id: m._id, title: m.title }))
                },
                offline: {
                    count: offlineResults.length,
                    movies: offlineResults.map(m => ({ id: m._id, title: m.title }))
                }
            },
            offlineMoviesTotal: offlineMovies.length
        });
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

// Force sync from MongoDB to file
app.get("/debug/sync-to-file", async(req, res) => {
    try {
        if (!isMongoConnected) {
            return res.json({
                success: false,
                message: "MongoDB not connected"
            });
        }

        await syncMoviesToFile();

        res.json({
            success: true,
            message: `Synced ${offlineMovies.length} movies from MongoDB to backup file`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test admin authentication
app.get("/debug/test-admin", (req, res) => {
    res.json({
        isAdmin: res.locals.isAdmin,
        adminQuery: req.query.admin,
        correctPassword: "8892",
        testUrls: {
            asAdmin: "/debug/test-admin?admin=8892",
            asUser: "/debug/test-admin",
            addMovie: "/admin/add?admin=8892"
        }
    });
});

// ============================
// 🌱 SEEDER ROUTE (ENHANCED)
// ============================
app.get("/seed", async(req, res) => {
    try {
        // Clear existing data first (optional)
        if (req.query.clear === 'true') {
            if (isMongoConnected) {
                await Movie.deleteMany({});
                console.log("🧹 Cleared existing movies from MongoDB");
            }
            offlineMovies = [];
            saveMoviesToFile();
            console.log("🧹 Cleared offline movies");
        }

        const sampleMovies = [{
                title: "Pushpa 2: The Rise",
                description: "Pushpa returns with more action, drama, and intensity in this highly anticipated sequel. The story continues as Pushpa rises to even greater heights of power and faces new challenges.",
                cast: ["Allu Arjun", "Rashmika Mandanna", "Fahadh Faasil"],
                genre: ["Action", "Drama", "Thriller"],
                movieLanguage: "Hindi",
                quality: ["480p", "720p", "1080p"],
                year: 2024,
                views: 150000,
                downloads: 25000,
                poster: "https://via.placeholder.com/300x450/FF6B6B/FFFFFF?text=Pushpa+2",
                screenshots: [
                    "https://via.placeholder.com/800x450/FF6B6B/FFFFFF?text=Pushpa+2+Scene+1",
                    "https://via.placeholder.com/800x450/4ECDC4/FFFFFF?text=Pushpa+2+Scene+2",
                    "https://via.placeholder.com/800x450/45B7D1/FFFFFF?text=Pushpa+2+Scene+3"
                ],
                qualityLinks: {
                    "480p": "https://example.com/pushpa2-480p",
                    "720p": "https://example.com/pushpa2-720p",
                    "1080p": "https://example.com/pushpa2-1080p"
                }
            },
            {
                title: "RRR",
                description: "A fictional story about two Indian revolutionaries, Alluri Sitarama Raju and Komaram Bheem, and their fight against the British Raj in the 1920s. An epic tale of friendship, betrayal, and revolution.",
                cast: ["N. T. Rama Rao Jr.", "Ram Charan", "Alia Bhatt", "Ajay Devgn"],
                genre: ["Action", "Drama", "History"],
                movieLanguage: "Hindi",
                quality: ["720p", "1080p", "4K"],
                year: 2022,
                views: 200000,
                downloads: 35000,
                poster: "https://via.placeholder.com/300x450/96CEB4/FFFFFF?text=RRR",
                screenshots: [
                    "https://via.placeholder.com/800x450/96CEB4/FFFFFF?text=RRR+Scene+1",
                    "https://via.placeholder.com/800x450/FFEAA7/FFFFFF?text=RRR+Scene+2",
                    "https://via.placeholder.com/800x450/DDA0DD/FFFFFF?text=RRR+Scene+3"
                ],
                qualityLinks: {
                    "720p": "https://example.com/rrr-720p",
                    "1080p": "https://example.com/rrr-1080p",
                    "4K": "https://example.com/rrr-4k"
                }
            },
            {
                title: "KGF Chapter 2",
                description: "The continuation of Rocky's journey as he rises to become the most feared and powerful man in the goldfields. The bloodiest chapter of K.G.F begins as Rocky takes control of the Kolar Gold Fields.",
                cast: ["Yash", "Sanjay Dutt", "Srinidhi Shetty", "Raveena Tandon"],
                genre: ["Action", "Crime", "Drama"],
                movieLanguage: "Hindi",
                quality: ["480p", "720p", "1080p"],
                year: 2022,
                views: 180000,
                downloads: 30000,
                poster: "https://via.placeholder.com/300x450/FF7675/FFFFFF?text=KGF+2",
                screenshots: [
                    "https://via.placeholder.com/800x450/FF7675/FFFFFF?text=KGF+2+Scene+1",
                    "https://via.placeholder.com/800x450/74B9FF/FFFFFF?text=KGF+2+Scene+2",
                    "https://via.placeholder.com/800x450/00B894/FFFFFF?text=KGF+2+Scene+3"
                ],
                qualityLinks: {
                    "480p": "https://example.com/kgf2-480p",
                    "720p": "https://example.com/kgf2-720p",
                    "1080p": "https://example.com/kgf2-1080p"
                }
            },
            {
                title: "Bahubali 2: The Conclusion",
                description: "The epic conclusion to the Bahubali saga. Why did Kattappa kill Bahubali? The answer lies in this spectacular finale that reveals the truth behind the betrayal.",
                cast: ["Prabhas", "Rana Daggubati", "Anushka Shetty", "Tamannaah"],
                genre: ["Action", "Drama", "Fantasy"],
                movieLanguage: "Hindi",
                quality: ["720p", "1080p", "4K"],
                year: 2017,
                views: 250000,
                downloads: 45000,
                poster: "https://via.placeholder.com/300x450/6C5CE7/FFFFFF?text=Bahubali+2",
                screenshots: [
                    "https://via.placeholder.com/800x450/6C5CE7/FFFFFF?text=Bahubali+2+Scene+1",
                    "https://via.placeholder.com/800x450/A29BFE/FFFFFF?text=Bahubali+2+Scene+2",
                    "https://via.placeholder.com/800x450/FD79A8/FFFFFF?text=Bahubali+2+Scene+3"
                ],
                qualityLinks: {
                    "720p": "https://example.com/bahubali2-720p",
                    "1080p": "https://example.com/bahubali2-1080p",
                    "4K": "https://example.com/bahubali2-4k"
                }
            },
            {
                title: "War",
                description: "An Indian action thriller film about an Indian RAW agent who is assigned to eliminate his former mentor who has gone rogue. High-octane action sequences and stunning visuals.",
                cast: ["Hrithik Roshan", "Tiger Shroff", "Vaani Kapoor"],
                genre: ["Action", "Thriller", "Adventure"],
                movieLanguage: "Hindi",
                quality: ["480p", "720p", "1080p"],
                year: 2019,
                views: 120000,
                downloads: 20000,
                poster: "https://via.placeholder.com/300x450/2D3436/FFFFFF?text=War",
                screenshots: [
                    "https://via.placeholder.com/800x450/2D3436/FFFFFF?text=War+Scene+1",
                    "https://via.placeholder.com/800x450/636E72/FFFFFF?text=War+Scene+2",
                    "https://via.placeholder.com/800x450/B2BEC3/FFFFFF?text=War+Scene+3"
                ],
                qualityLinks: {
                    "480p": "https://example.com/war-480p",
                    "720p": "https://example.com/war-720p",
                    "1080p": "https://example.com/war-1080p"
                }
            }
        ];

        let result = {};

        if (isMongoConnected) {
            const createdMovies = await Movie.insertMany(sampleMovies);
            result.mongodb = {
                success: true,
                count: createdMovies.length,
                movies: createdMovies.map(m => ({ id: m._id, title: m.title }))
            };

            // Also sync to offline backup
            await syncMoviesToFile();
        } else {
            // Add to offline storage
            for (const movieData of sampleMovies) {
                const newMovie = {
                    ...movieData,
                    _id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                offlineMovies.unshift(newMovie);
            }
            saveMoviesToFile();

            result.offline = {
                success: true,
                count: sampleMovies.length,
                movies: sampleMovies.map(m => ({ title: m.title }))
            };
        }

        res.json({
            success: true,
            mode: isMongoConnected ? 'Online' : 'Offline',
            message: `✅ Successfully added ${sampleMovies.length} movies!`,
            adminTestUrl: "/?admin=8892",
            addMovieUrl: "/admin/add?admin=8892",
            ...result
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
    res.status(404).render("404", {
        isAdmin: res.locals.isAdmin || false
    });
});

app.use((err, req, res, next) => {
    console.error("💥 Unhandled error:", err);
    res.status(500).render("error", {
        message: "Something went wrong!",
        statusCode: 500,
        isAdmin: res.locals.isAdmin || false
    });
});
// Add these debug routes to your app.js

// Debug route to check app status
app.get('/debug/status', (req, res) => {
    res.json({
        mongoConnected: isMongoConnected,
        offlineMoviesCount: offlineMovies ? offlineMovies.length : 0,
        offlineMoviesLoaded: !!offlineMovies,
        mode: isMongoConnected ? 'Online' : 'Offline'
    });
});

// Debug route to check movies availability
app.get('/debug/movies', async(req, res) => {
    try {
        let mongoCount = 0;
        let offlineCount = offlineMovies ? offlineMovies.length : 0;

        if (isMongoConnected) {
            mongoCount = await Movie.countDocuments();
        }

        res.json({
            mongoConnected: isMongoConnected,
            mongoMoviesCount: mongoCount,
            offlineMoviesCount: offlineCount,
            sampleOfflineMovie: offlineMovies ? offlineMovies[0] : null
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Debug route to test movie loading logic
app.get('/debug/test-movie-load', async(req, res) => {
    try {
        let movies = [];
        let source = '';

        if (isMongoConnected) {
            movies = await Movie.find({}).limit(5).lean();
            source = 'MongoDB';
        } else {
            movies = offlineMovies ? offlineMovies.slice(0, 5) : [];
            source = 'Offline Backup';
        }

        res.json({
            source: source,
            movieCount: movies.length,
            movies: movies.map(m => ({ title: m.title, year: m.year }))
        });
    } catch (error) {
        res.json({ error: error.message, source: 'Error' });
    }
});
// ============================
// 🚀 START SERVER
// ============================
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`🔧 Admin access: http://localhost:${PORT}/?admin=8892`);
    console.log(`➕ Add movies: http://localhost:${PORT}/admin/add?admin=8892`);
    console.log(`🔧 Debug routes available:`);
    console.log(`   - GET /debug/db-status - Check database and offline status`);
    console.log(`   - GET /debug/test-search?q=movie - Test search functionality`);
    console.log(`   - GET /debug/sync-to-file - Force sync MongoDB to backup file`);
    console.log(`   - GET /debug/test-admin?admin=8892 - Test admin authentication`);
    console.log(`   - GET /seed - Add sample movies`);
    console.log(`   - GET /seed?clear=true - Clear and add sample movies`);

    // Initialize the app
    initializeApp();
});